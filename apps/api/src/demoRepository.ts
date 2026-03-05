import { buildDemoScenarios, type DemoScenario } from '@swiftcat/shared';

const scenarios = buildDemoScenarios();
const scenariosById = new Map<string, DemoScenario>(scenarios.map((scenario) => [scenario.id, scenario]));

export function listScenarios(): DemoScenario[] {
  return scenarios;
}

export function getScenarioById(id: string): DemoScenario | undefined {
  return scenariosById.get(id);
}
