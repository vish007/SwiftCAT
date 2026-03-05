import { describe, expect, it } from 'vitest';
import { getApprovalPolicy, isApprovalSatisfied, requestedByFromRole } from './approvalWorkflow.js';

describe('approval workflow policies', () => {
  it('requires maker and checker for outbound send', () => {
    expect(getApprovalPolicy('OUTBOUND_SWIFT_SEND', false)).toEqual({ requireMaker: true, requireChecker: true });
  });

  it('requires checker for high-risk action', () => {
    expect(getApprovalPolicy('POST_TO_CBS', true)).toEqual({ requireMaker: false, requireChecker: true });
  });

  it('maps requester by role', () => {
    expect(requestedByFromRole('AI_Agent')).toBe('ai');
    expect(requestedByFromRole('Maker')).toBe('user');
  });

  it('marks approval satisfied only when required actors approve', () => {
    const approval = {
      makerUserId: 1,
      checkerUserId: 2
    };
    expect(isApprovalSatisfied(approval, { requireMaker: true, requireChecker: true })).toBe(true);
    expect(isApprovalSatisfied({ makerUserId: null, checkerUserId: 2 }, { requireMaker: true, requireChecker: true })).toBe(false);
  });
});
