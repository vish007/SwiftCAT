import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildDemoScenarios,
  classifyMessage,
  evaluatePolicies,
  paginateScenarios,
  postPaymentTool,
  resetToolLedger
} from './demo';

describe('classifier', () => {
  it('classifies payment, trade and recon message kinds', () => {
    expect(classifyMessage('MX_PACS_008')).toBe('payments');
    expect(classifyMessage('MT700')).toBe('trade');
    expect(classifyMessage('MT202')).toBe('recon');
  });
});

describe('policies', () => {
  it('returns expected policy actions', () => {
    expect(evaluatePolicies({ messageKind: 'MT700', hasSoftClause: true, statementMatched: true })).toContain('COMPLIANCE_REVIEW_REQUIRED');
    expect(evaluatePolicies({ messageKind: 'MT202', hasSoftClause: false, statementMatched: false })).toContain('CREATE_RECON_EXCEPTION');
    expect(evaluatePolicies({ messageKind: 'MX_PACS_008', hasSoftClause: false, statementMatched: true })).toContain('RUN_SANCTIONS_SCREENING');
  });
});

describe('tool idempotency', () => {
  beforeEach(() => {
    resetToolLedger();
  });

  it('skips repeated calls with same idempotency key', () => {
    const first = postPaymentTool('corr-123');
    const second = postPaymentTool('corr-123');

    expect(first.status).toBe('SUCCESS');
    expect(second.status).toBe('SKIPPED');
  });
});

describe('integration flow and pagination', () => {
  beforeEach(() => {
    resetToolLedger();
  });

  it('builds demo scenarios with closed work items and correlated tool calls', () => {
    const scenarios = buildDemoScenarios();

    expect(scenarios).toHaveLength(3);
    for (const scenario of scenarios) {
      expect(scenario.status).toBe('CLOSED');
      for (const step of scenario.timeline) {
        expect(step.correlationId).toBeTruthy();
      }
      for (const call of scenario.toolCalls) {
        expect(call.correlationId).toBeTruthy();
      }
    }
  });

  it('paginates scenarios', () => {
    const result = paginateScenarios(buildDemoScenarios(), 2, 1);
    expect(result.data).toHaveLength(1);
    expect(result.page).toBe(2);
    expect(result.total).toBe(3);
  });
});
