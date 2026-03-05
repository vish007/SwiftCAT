import { describe, expect, it } from 'vitest';
import { buildScenarioDigest } from './App';

describe('UI e2e digest for payment scenario', () => {
  it('includes work item, timeline and closure markers', () => {
    const digest = buildScenarioDigest({
      id: 'payments-pacs008',
      name: 'Payments (MX pacs.008) straight-through',
      messageKind: 'MX_PACS_008',
      workItemId: 'WI-1001',
      classification: 'payments',
      status: 'CLOSED',
      timeline: [
        { id: '1', label: 'Ingest pacs.008', actor: 'ingest', status: 'done', correlationId: 'corr-pay-001' },
        { id: '2', label: 'Post to CBS payment tool', actor: 'tool', status: 'done', correlationId: 'corr-pay-001' }
      ],
      approvals: [],
      toolCalls: []
    });

    expect(digest).toContain('WI-1001');
    expect(digest).toContain('Ingest pacs.008');
    expect(digest).toContain('CLOSED');
  });
});
