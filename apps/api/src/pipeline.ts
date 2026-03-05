import type { PrismaClient, WorkItem, WorkItemState } from '@prisma/client';

const PAYMENT_TYPES = new Set(['MT103', 'MT202', 'PACS.008']);
const STATEMENT_TYPES = new Set(['MT940', 'MT950', 'CAMT.053']);
const TRADE_TYPES = new Set(['MT700', 'MT707', 'MT760', 'MT767']);
const SANCTION_TERMS = ['sanction keyword', 'blocked entity', 'watchlist'];

export type ClassificationResult = {
  domain: string;
  queueName: string;
  priority: number;
  rationale: string;
  confidence: number;
};

export type ScreeningResult = {
  toolName: 'tool.sanctions.screen';
  hit: boolean;
  score: number;
  riskFactors: string[];
  rationale: string;
};

export type PolicyEvaluation = {
  queueName: string;
  finalState: WorkItemState;
  decisions: { policyName: string; allow: boolean; rationale: string }[];
};

export function classifyMessage(messageType: string): ClassificationResult {
  const normalizedType = messageType.toUpperCase();

  if (PAYMENT_TYPES.has(normalizedType)) {
    return { domain: 'payments', queueName: 'payments-ops', priority: 80, rationale: `${normalizedType} deterministically maps to payments domain`, confidence: 0.98 };
  }
  if (STATEMENT_TYPES.has(normalizedType)) {
    return { domain: 'statements-reconciliation', queueName: 'reconciliation-ops', priority: 60, rationale: `${normalizedType} deterministically maps to statements/reconciliation domain`, confidence: 0.98 };
  }
  if (TRADE_TYPES.has(normalizedType) || normalizedType.startsWith('MT7')) {
    return { domain: 'trade', queueName: 'trade-ops', priority: 70, rationale: `${normalizedType} deterministically maps to trade domain`, confidence: 0.96 };
  }

  return { domain: 'operations-review', queueName: 'ops-review', priority: 40, rationale: `${normalizedType} not in deterministic map, routed for review`, confidence: 0.45 };
}

export function screenMessage(rawMessage: string): ScreeningResult {
  const normalized = rawMessage.toLowerCase();
  const riskFactors = SANCTION_TERMS.filter((term) => normalized.includes(term));
  const hit = riskFactors.length > 0;

  return {
    toolName: 'tool.sanctions.screen',
    hit,
    score: hit ? 0.95 : 0.02,
    riskFactors,
    rationale: hit ? `Sanctions screening matched: ${riskFactors.join(', ')}` : 'No sanctions matches detected'
  };
}

export function evaluatePolicy(classification: ClassificationResult, screening: ScreeningResult): PolicyEvaluation {
  const decisions = [
    { policyName: 'sanctions-hit-route-compliance', allow: !screening.hit, rationale: screening.hit ? 'Sanctions hit requires compliance exception routing' : 'No sanctions hit' },
    { policyName: 'low-confidence-requires-ops-review', allow: classification.confidence >= 0.75, rationale: classification.confidence < 0.75 ? 'Low confidence classification requires operations review' : 'Classification confidence is acceptable' },
    { policyName: 'outbound-action-requires-approval', allow: false, rationale: 'Outbound actions are blocked pending explicit human approval' }
  ];

  if (screening.hit) return { queueName: 'compliance-review', finalState: 'EXCEPTION', decisions };
  if (classification.confidence < 0.75) return { queueName: 'ops-review', finalState: 'EXCEPTION', decisions };
  return { queueName: classification.queueName, finalState: 'READY', decisions };
}

export async function runPipeline(prisma: PrismaClient, workItemId: number): Promise<WorkItem> {
  const workItem = await prisma.workItem.findUniqueOrThrow({ where: { id: workItemId } });
  const classifyStep = await prisma.agentStep.create({ data: { workItemId, stepName: 'CLASSIFY', status: 'COMPLETED', rationale: 'CLASSIFY step executed' } });

  const classification = classifyMessage(workItem.messageType);
  const targetQueue = await prisma.queue.upsert({ where: { name: classification.queueName }, update: {}, create: { name: classification.queueName } });
  await prisma.workItem.update({ where: { id: workItemId }, data: { domain: classification.domain, queueId: targetQueue.id, priority: classification.priority, rationale: classification.rationale, confidence: classification.confidence } });
  await recordTransition(prisma, workItemId, workItem.state, 'CLASSIFIED', 'Classified and queued');

  const screenStep = await prisma.agentStep.create({ data: { workItemId, stepName: 'SCREEN', status: 'COMPLETED', rationale: 'Sanctions screening executed' } });
  const screening = screenMessage(workItem.rawMessage);
  await prisma.screeningResult.upsert({
    where: { workItemId },
    update: { toolName: screening.toolName, hit: screening.hit, score: screening.score, riskFactors: screening.riskFactors.join('|') },
    create: { workItemId, toolName: screening.toolName, hit: screening.hit, score: screening.score, riskFactors: screening.riskFactors.join('|') }
  });
  await recordTransition(prisma, workItemId, 'CLASSIFIED', 'SCREENED', screening.rationale);

  const policyStep = await prisma.agentStep.create({ data: { workItemId, stepName: 'POLICY_CHECK', status: 'COMPLETED', rationale: 'Policy checks evaluated' } });
  const policy = evaluatePolicy(classification, screening);
  for (const decision of policy.decisions) {
    await prisma.policyDecision.create({ data: { workItemId, agentStepId: policyStep.id, policyName: decision.policyName, allow: decision.allow, rationale: decision.rationale } });
  }

  const resolvedQueue = await prisma.queue.upsert({ where: { name: policy.queueName }, update: {}, create: { name: policy.queueName } });
  await recordTransition(prisma, workItemId, 'SCREENED', 'ROUTED', `Policy routed to ${policy.queueName}`);
  await recordTransition(prisma, workItemId, 'ROUTED', policy.finalState, policy.finalState === 'EXCEPTION' ? 'Policy requires manual review' : 'Eligible for normal processing');
  await prisma.workItem.update({ where: { id: workItemId }, data: { queueId: resolvedQueue.id } });

  await prisma.agentStep.update({ where: { id: classifyStep.id }, data: { rationale: classification.rationale } });
  await prisma.agentStep.update({ where: { id: screenStep.id }, data: { rationale: screening.rationale } });
  return prisma.workItem.findUniqueOrThrow({ where: { id: workItemId } });
}

async function recordTransition(prisma: PrismaClient, workItemId: number, fromState: WorkItemState, toState: WorkItemState, rationale: string) {
  await prisma.workItemStateTransition.create({ data: { workItemId, fromState, toState, rationale } });
  await prisma.workItem.update({ where: { id: workItemId }, data: { state: toState } });
}
