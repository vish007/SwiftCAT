import { describe, expect, it } from 'vitest';
import { getScenarioById, listScenarios } from './demoRepository';

describe('ingest -> agent -> work item integration dataset', () => {
  it('contains all three required demo scenarios in CLOSED state', () => {
    const scenarios = listScenarios();
    expect(scenarios).toHaveLength(3);
    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      'payments-pacs008',
      'trade-mt700',
      'recon-mt202-break'
    ]);

    for (const scenario of scenarios) {
      expect(scenario.status).toBe('CLOSED');
      expect(scenario.workItemId).toMatch(/^WI-/);
      expect(scenario.timeline.length).toBeGreaterThan(0);
    }
  });

  it('ensures correlation IDs are preserved across timeline and tool calls', () => {
    const scenario = getScenarioById('payments-pacs008');
    expect(scenario).toBeTruthy();
    if (!scenario) {
      return;
    }

    const timelineIds = new Set(scenario.timeline.map((step) => step.correlationId));
    const toolIds = new Set(scenario.toolCalls.map((call) => call.correlationId));

    expect(timelineIds.size).toBe(1);
    expect(toolIds.size).toBe(1);
    expect([...timelineIds][0]).toBe([...toolIds][0]);
  });
});
