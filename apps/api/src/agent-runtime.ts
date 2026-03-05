import { AgentRunStatus, AgentStepStatus, AgentStepType, WorkItemStatus } from '@prisma/client';

export type JsonRecord = Record<string, unknown>;

type RuntimeContext = {
  runId: number;
  workItemId: number;
};

export type AgentRuntimeStore = {
  createRun: (input: { workItemId: number; startedByUserId: number }) => Promise<{ id: number }>;
  markRunSucceeded: (runId: number) => Promise<void>;
  markRunFailed: (runId: number, error: JsonRecord) => Promise<void>;
  createStep: (input: {
    runId: number;
    stepName: string;
    stepType: AgentStepType;
    input?: JsonRecord;
    rationale?: string;
  }) => Promise<{ id: number }>;
  markStepSucceeded: (stepId: number, output?: JsonRecord) => Promise<void>;
  markStepFailed: (stepId: number, error: JsonRecord) => Promise<void>;
  updateWorkItemState: (workItemId: number, nextState: WorkItemStatus) => Promise<void>;
};

type RuntimeStep = {
  name: string;
  type: AgentStepType;
  rationale: string;
  input?: JsonRecord;
  execute: (context: RuntimeContext, store: AgentRuntimeStore) => Promise<JsonRecord | undefined>;
};

const runtimeSteps: RuntimeStep[] = [
  {
    name: 'received_to_classified',
    type: AgentStepType.STATE_TRANSITION,
    rationale: 'Placeholder transition into classified state.',
    input: { from: WorkItemStatus.RECEIVED, to: WorkItemStatus.CLASSIFIED },
    execute: async (context, store) => {
      await store.updateWorkItemState(context.workItemId, WorkItemStatus.CLASSIFIED);
      return { transitionedTo: WorkItemStatus.CLASSIFIED };
    }
  },
  {
    name: 'policy_check_allow',
    type: AgentStepType.POLICY_CHECK,
    rationale: 'Placeholder policy check currently allows all work items.',
    execute: async () => ({ decision: 'ALLOW' })
  },
  {
    name: 'classified_to_routed',
    type: AgentStepType.STATE_TRANSITION,
    rationale: 'Placeholder transition into routed state.',
    input: { from: WorkItemStatus.CLASSIFIED, to: WorkItemStatus.ROUTED },
    execute: async (context, store) => {
      await store.updateWorkItemState(context.workItemId, WorkItemStatus.ROUTED);
      return { transitionedTo: WorkItemStatus.ROUTED };
    }
  }
];

export async function runAgentForWorkItem(input: {
  workItemId: number;
  startedByUserId: number;
  store: AgentRuntimeStore;
}): Promise<{ runId: number; status: AgentRunStatus }> {
  const { workItemId, startedByUserId, store } = input;
  const run = await store.createRun({ workItemId, startedByUserId });

  try {
    for (const step of runtimeSteps) {
      const persistedStep = await store.createStep({
        runId: run.id,
        stepName: step.name,
        stepType: step.type,
        input: step.input,
        rationale: step.rationale
      });

      try {
        const output = await step.execute({ runId: run.id, workItemId }, store);
        await store.markStepSucceeded(persistedStep.id, output);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown step failure';
        await store.markStepFailed(persistedStep.id, { reason });
        throw error;
      }
    }

    await store.markRunSucceeded(run.id);
    return { runId: run.id, status: AgentRunStatus.SUCCEEDED };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown run failure';
    await store.markRunFailed(run.id, { reason });
    return { runId: run.id, status: AgentRunStatus.FAILED };
  }
}

export const defaultStepStatus = AgentStepStatus.STARTED;
