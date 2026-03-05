import { describe, expect, it } from 'vitest';
import { classifyMessage, evaluatePolicy, screenMessage } from './pipeline.js';

describe('pipeline integration scenarios', () => {
  it('routes MT700 with sanctions keyword to compliance exception', () => {
    const classification = classifyMessage('MT700');
    const screening = screenMessage('LC issuance includes sanction keyword for blocked entity');
    const policy = evaluatePolicy(classification, screening);

    expect(classification.domain).toBe('trade');
    expect(screening.hit).toBe(true);
    expect(policy.queueName).toBe('compliance-review');
    expect(policy.finalState).toBe('EXCEPTION');
  });

  it('routes pacs.008 to payments queue', () => {
    const classification = classifyMessage('pacs.008');
    const screening = screenMessage('normal customer payment');
    const policy = evaluatePolicy(classification, screening);

    expect(classification.domain).toBe('payments');
    expect(policy.queueName).toBe('payments-ops');
    expect(policy.finalState).toBe('READY');
  });
});
