import { describe, expect, it } from 'vitest';
import { ToolRuntime } from './tools.js';

function createPrismaMock() {
  const invocations = new Map<string, {
    id: number;
    agentStepId: number;
    toolName: string;
    idempotencyKey: string;
    request: Record<string, unknown>;
    status: string;
    attemptCount: number;
    response: unknown;
  }>();

  let sequence = 1;
  const tools = new Map<string, { enabled: boolean; retryPolicy: unknown }>([
    ['tool.sanctions.screen', { enabled: true, retryPolicy: { maxAttempts: 2 } }]
  ]);

  return {
    invocations,
    client: {
      toolRegistry: {
        findUnique: async ({ where }: { where: { toolName: string } }) => tools.get(where.toolName) ?? null
      },
      toolInvocation: {
        findUnique: async ({ where }: { where: { agentStepId_idempotencyKey: { agentStepId: number; idempotencyKey: string } } }) => {
          const key = `${where.agentStepId_idempotencyKey.agentStepId}:${where.agentStepId_idempotencyKey.idempotencyKey}`;
          return invocations.get(key) ?? null;
        },
        create: async ({ data }: { data: { agentStepId: number; toolName: string; idempotencyKey: string; request: Record<string, unknown>; status: string; attemptCount: number } }) => {
          const key = `${data.agentStepId}:${data.idempotencyKey}`;
          const record = { id: sequence++, response: null, ...data };
          invocations.set(key, record);
          return record;
        },
        update: async ({ where, data }: { where: { id: number }; data: { status: string; attemptCount: number; response: Record<string, unknown> } }) => {
          const record = Array.from(invocations.values()).find((item) => item.id === where.id);
          if (!record) {
            throw new Error('Invocation not found');
          }
          const updated = { ...record, ...data };
          invocations.set(`${updated.agentStepId}:${updated.idempotencyKey}`, updated);
          return updated;
        }
      }
    }
  };
}

describe('ToolRuntime', () => {
  it('deduplicates invocations by step and idempotency key', async () => {
    const prisma = createPrismaMock();
    const runtime = new ToolRuntime(prisma.client);

    const first = await runtime.invokeTool({
      agentStepId: 11,
      toolName: 'tool.sanctions.screen',
      idempotencyKey: 'idempotent-1',
      request: { entity: 'ACME' }
    });

    const second = await runtime.invokeTool({
      agentStepId: 11,
      toolName: 'tool.sanctions.screen',
      idempotencyKey: 'idempotent-1',
      request: { entity: 'ACME' }
    });

    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(prisma.invocations.size).toBe(1);
  });

  it('persists invocation status and response', async () => {
    const prisma = createPrismaMock();
    const runtime = new ToolRuntime(prisma.client);

    const result = await runtime.invokeTool({
      agentStepId: 22,
      toolName: 'tool.sanctions.screen',
      idempotencyKey: 'persist-1',
      request: { entity: 'Global Trading LLC' }
    });

    const persisted = prisma.invocations.get('22:persist-1');
    expect(result.status).toBe('SUCCESS');
    expect(result.attemptCount).toBe(1);
    expect(persisted?.status).toBe('SUCCESS');
    expect(persisted?.response).toEqual({ screened: true, match: false, entity: 'Global Trading LLC' });
  });
});
