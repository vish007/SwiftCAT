import { AgentRunStatus, AgentStepType, WorkItemStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { AgentRuntimeStore } from './agent-runtime.js';
import { runAgentForWorkItem } from './agent-runtime.js';

function buildStore() {
  let runId = 1;
  let stepId = 1;
  const stateTransitions: WorkItemStatus[] = [];
  const runUpdates: Array<{ id: number; status: AgentRunStatus }> = [];
  const steps: Array<{ id: number; name: string; type: AgentStepType; status: string }> = [];

  const store: AgentRuntimeStore = {
    createRun: async () => ({ id: runId++ }),
    markRunSucceeded: async (id) => {
      runUpdates.push({ id, status: AgentRunStatus.SUCCEEDED });
    },
    markRunFailed: async (id) => {
      runUpdates.push({ id, status: AgentRunStatus.FAILED });
    },
    createStep: async ({ stepName, stepType }) => {
      const id = stepId++;
      steps.push({ id, name: stepName, type: stepType, status: 'STARTED' });
      return { id };
    },
    markStepSucceeded: async (id) => {
      const step = steps.find((item) => item.id === id);
      if (step) step.status = 'SUCCEEDED';
    },
    markStepFailed: async (id) => {
      const step = steps.find((item) => item.id === id);
      if (step) step.status = 'FAILED';
    },
    updateWorkItemState: async (_workItemId, nextState) => {
      stateTransitions.push(nextState);
    }
  };

  return { store, stateTransitions, runUpdates, steps };
}

describe('agent runtime', () => {
  it('records successful skeleton run and steps', async () => {
    const { store, runUpdates, steps, stateTransitions } = buildStore();

    const result = await runAgentForWorkItem({ workItemId: 10, startedByUserId: 5, store });

    expect(result.status).toBe(AgentRunStatus.SUCCEEDED);
    expect(steps).toHaveLength(3);
    expect(steps.map((step) => step.type)).toEqual([
      AgentStepType.STATE_TRANSITION,
      AgentStepType.POLICY_CHECK,
      AgentStepType.STATE_TRANSITION
    ]);
    expect(steps.every((step) => step.status === 'SUCCEEDED')).toBe(true);
    expect(stateTransitions).toEqual([WorkItemStatus.CLASSIFIED, WorkItemStatus.ROUTED]);
    expect(runUpdates).toEqual([{ id: 1, status: AgentRunStatus.SUCCEEDED }]);
  });

  it('marks run failed when a step fails', async () => {
    const { store, runUpdates, steps } = buildStore();
    let transitions = 0;
    store.updateWorkItemState = async () => {
      transitions += 1;
      if (transitions === 2) {
        throw new Error('cannot transition');
      }
    };

    const result = await runAgentForWorkItem({ workItemId: 11, startedByUserId: 5, store });

    expect(result.status).toBe(AgentRunStatus.FAILED);
    expect(steps.at(-1)?.status).toBe('FAILED');
    expect(runUpdates).toEqual([{ id: 1, status: AgentRunStatus.FAILED }]);
  });
});
