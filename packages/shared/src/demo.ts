export type MessageKind = 'MX_PACS_008' | 'MT700' | 'MT202';

export type Classification = 'payments' | 'trade' | 'recon';

export type WorkItemStatus = 'OPEN' | 'PENDING_APPROVAL' | 'CLOSED';

export type TimelineStep = {
  id: string;
  label: string;
  actor: 'ingest' | 'agent' | 'tool' | 'human';
  status: 'done' | 'pending';
  correlationId: string;
};

export type Approval = {
  id: string;
  requiredRole: 'Compliance' | 'Maker';
  status: 'APPROVED' | 'PENDING';
  rationale: string;
};

export type ToolCall = {
  id: string;
  name: string;
  idempotencyKey: string;
  status: 'SUCCESS' | 'SKIPPED';
  correlationId: string;
};

export type DemoScenario = {
  id: string;
  name: string;
  messageKind: MessageKind;
  workItemId: string;
  classification: Classification;
  status: WorkItemStatus;
  timeline: TimelineStep[];
  approvals: Approval[];
  toolCalls: ToolCall[];
};

const paymentLedger = new Set<string>();

export function classifyMessage(kind: MessageKind): Classification {
  if (kind === 'MX_PACS_008') {
    return 'payments';
  }
  if (kind === 'MT700') {
    return 'trade';
  }
  return 'recon';
}

export function evaluatePolicies(input: { messageKind: MessageKind; hasSoftClause: boolean; statementMatched: boolean }): string[] {
  const actions: string[] = [];
  if (input.messageKind === 'MT700' && input.hasSoftClause) {
    actions.push('COMPLIANCE_REVIEW_REQUIRED');
  }
  if (input.messageKind === 'MT202' && !input.statementMatched) {
    actions.push('CREATE_RECON_EXCEPTION');
  }
  if (input.messageKind === 'MX_PACS_008') {
    actions.push('RUN_SANCTIONS_SCREENING');
  }
  return actions;
}

export function postPaymentTool(idempotencyKey: string): ToolCall {
  if (paymentLedger.has(idempotencyKey)) {
    return {
      id: `tool-${idempotencyKey}`,
      name: 'tool.cbs.payment.post',
      idempotencyKey,
      status: 'SKIPPED',
      correlationId: idempotencyKey
    };
  }

  paymentLedger.add(idempotencyKey);
  return {
    id: `tool-${idempotencyKey}`,
    name: 'tool.cbs.payment.post',
    idempotencyKey,
    status: 'SUCCESS',
    correlationId: idempotencyKey
  };
}

export function resetToolLedger() {
  paymentLedger.clear();
}

export function buildDemoScenarios(): DemoScenario[] {
  const paymentCorrelationId = 'corr-pay-001';
  const tradeCorrelationId = 'corr-trade-001';
  const reconCorrelationId = 'corr-recon-001';

  return [
    {
      id: 'payments-pacs008',
      name: 'Payments (MX pacs.008) straight-through',
      messageKind: 'MX_PACS_008',
      workItemId: 'WI-1001',
      classification: classifyMessage('MX_PACS_008'),
      status: 'CLOSED',
      timeline: [
        { id: 't1', label: 'Ingest pacs.008', actor: 'ingest', status: 'done', correlationId: paymentCorrelationId },
        { id: 't2', label: 'Map to canonical payment', actor: 'agent', status: 'done', correlationId: paymentCorrelationId },
        { id: 't3', label: 'Create work item', actor: 'agent', status: 'done', correlationId: paymentCorrelationId },
        { id: 't4', label: 'Classify payments + sanctions screen', actor: 'agent', status: 'done', correlationId: paymentCorrelationId },
        { id: 't5', label: 'Post to CBS payment tool', actor: 'tool', status: 'done', correlationId: paymentCorrelationId },
        { id: 't6', label: 'Auto-close work item', actor: 'agent', status: 'done', correlationId: paymentCorrelationId }
      ],
      approvals: [],
      toolCalls: [postPaymentTool(paymentCorrelationId)]
    },
    {
      id: 'trade-mt700',
      name: 'Category-7 LC (MT700) with soft clause',
      messageKind: 'MT700',
      workItemId: 'WI-2001',
      classification: classifyMessage('MT700'),
      status: 'CLOSED',
      timeline: [
        { id: 't1', label: 'Ingest MT700', actor: 'ingest', status: 'done', correlationId: tradeCorrelationId },
        { id: 't2', label: 'Classify trade finance', actor: 'agent', status: 'done', correlationId: tradeCorrelationId },
        { id: 't3', label: 'Run policy checks', actor: 'agent', status: 'done', correlationId: tradeCorrelationId },
        { id: 't4', label: 'Compliance review + proposal', actor: 'human', status: 'done', correlationId: tradeCorrelationId },
        { id: 't5', label: 'Approval captured and outbound send', actor: 'tool', status: 'done', correlationId: tradeCorrelationId }
      ],
      approvals: [
        {
          id: 'app-700-1',
          requiredRole: 'Compliance',
          status: 'APPROVED',
          rationale: 'Soft clause accepted with documented trade rationale and customer profile alignment.'
        }
      ],
      toolCalls: [
        {
          id: 'tool-trade-send-1',
          name: 'tool.swift.outbound.send',
          idempotencyKey: tradeCorrelationId,
          status: 'SUCCESS',
          correlationId: tradeCorrelationId
        }
      ]
    },
    {
      id: 'recon-mt202-break',
      name: 'Recon break (MT202 unmatched statement)',
      messageKind: 'MT202',
      workItemId: 'WI-3001',
      classification: classifyMessage('MT202'),
      status: 'CLOSED',
      timeline: [
        { id: 't1', label: 'Ingest MT202', actor: 'ingest', status: 'done', correlationId: reconCorrelationId },
        { id: 't2', label: 'Classify reconciliation queue', actor: 'agent', status: 'done', correlationId: reconCorrelationId },
        { id: 't3', label: 'Create exception for missing statement match', actor: 'agent', status: 'done', correlationId: reconCorrelationId },
        { id: 't4', label: 'Manual match by operations', actor: 'human', status: 'done', correlationId: reconCorrelationId },
        { id: 't5', label: 'Exception resolved and work item closed', actor: 'agent', status: 'done', correlationId: reconCorrelationId }
      ],
      approvals: [],
      toolCalls: [
        {
          id: 'tool-recon-1',
          name: 'tool.recon.exception.close',
          idempotencyKey: reconCorrelationId,
          status: 'SUCCESS',
          correlationId: reconCorrelationId
        }
      ]
    }
  ];
}

export function paginateScenarios(scenarios: DemoScenario[], page: number, pageSize: number) {
  const boundedPage = Math.max(1, page);
  const boundedSize = Math.min(Math.max(pageSize, 1), 50);
  const start = (boundedPage - 1) * boundedSize;
  const data = scenarios.slice(start, start + boundedSize);

  return {
    data,
    page: boundedPage,
    pageSize: boundedSize,
    total: scenarios.length,
    totalPages: Math.ceil(scenarios.length / boundedSize)
  };
}
