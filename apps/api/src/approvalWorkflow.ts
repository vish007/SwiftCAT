import type { ActionType, Approval, RequestedBy, WorkItem } from '@prisma/client';
import { prisma } from './prisma.js';

const HIGH_RISK_ACTIONS: ActionType[] = ['POST_TO_CBS', 'CLOSE_CASE'];

export type ApprovalPolicy = {
  requireMaker: boolean;
  requireChecker: boolean;
};

export function getApprovalPolicy(actionType: ActionType, isHighRisk: boolean): ApprovalPolicy {
  if (actionType === 'OUTBOUND_SWIFT_SEND') {
    return { requireMaker: true, requireChecker: true };
  }

  if (isHighRisk || HIGH_RISK_ACTIONS.includes(actionType)) {
    return { requireMaker: false, requireChecker: true };
  }

  return { requireMaker: false, requireChecker: false };
}

export async function logAgentStep(params: {
  workItemId: number;
  stepType: string;
  details: string;
  performedBy?: number;
}) {
  await prisma.agentStep.create({
    data: {
      workItemId: params.workItemId,
      stepType: params.stepType,
      details: params.details,
      performedBy: params.performedBy
    }
  });
}

export async function logMessageAction(params: {
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  performedBy: number;
}) {
  await prisma.messageAction.create({
    data: {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: params.details,
      performedBy: params.performedBy
    }
  });
}

export async function executeOutboundSwiftSend(workItem: WorkItem, actorUser: { id: number }) {
  await logAgentStep({
    workItemId: workItem.id,
    stepType: 'TOOL_EXECUTED',
    details: 'tool.swift.outbound.send invoked after approvals.',
    performedBy: actorUser.id
  });

  await logMessageAction({
    action: 'TOOL_SWIFT_OUTBOUND_SEND_EXECUTED',
    entityType: 'work_item',
    entityId: String(workItem.id),
    details: JSON.stringify(workItem.payload),
    performedBy: actorUser.id
  });
}

export function isApprovalSatisfied(approval: Pick<Approval, 'makerUserId' | 'checkerUserId'>, policy: ApprovalPolicy): boolean {
  const makerSatisfied = !policy.requireMaker || Boolean(approval.makerUserId);
  const checkerSatisfied = !policy.requireChecker || Boolean(approval.checkerUserId);
  return makerSatisfied && checkerSatisfied;
}

export function requestedByFromRole(role: string): RequestedBy {
  return role === 'AI_Agent' ? 'ai' : 'user';
}
