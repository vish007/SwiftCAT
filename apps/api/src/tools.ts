interface ToolRuntimePrisma {
  toolInvocation: {
    findUnique: (args: {
      where: { agentStepId_idempotencyKey: { agentStepId: number; idempotencyKey: string } };
    }) => Promise<ToolInvocationRecord | null>;
    create: (args: {
      data: {
        agentStepId: number;
        toolName: string;
        idempotencyKey: string;
        request: ToolRequest;
        status: string;
        attemptCount: number;
      };
    }) => Promise<ToolInvocationRecord>;
    update: (args: {
      where: { id: number };
      data: { status: string; attemptCount: number; response: ToolResponse };
    }) => Promise<ToolInvocationRecord>;
  };
  toolRegistry: {
    findUnique: (args: { where: { toolName: string } }) => Promise<{ retryPolicy: unknown; enabled: boolean } | null>;
  };
}

interface ToolInvocationRecord {
  id: number;
  status: string;
  attemptCount: number;
  response: unknown;
}

export type ToolRequest = Record<string, unknown>;
export type ToolResponse = Record<string, unknown>;

export type MockToolConnector = (input: ToolRequest) => Promise<ToolResponse>;

const connectors: Record<string, MockToolConnector> = {
  'tool.sanctions.screen': async (input) => ({
    screened: true,
    match: false,
    entity: input.entity ?? 'unknown'
  }),
  'tool.cbs.payment.post': async (input) => ({
    posted: true,
    paymentReference: `PAY-${String(input.paymentId ?? 'unknown')}`
  }),
  'tool.trade.case.create': async (input) => ({
    created: true,
    caseId: `TRD-${String(input.tradeId ?? 'unknown')}`
  }),
  'tool.treasury.nostro.fetch': async (input) => ({
    fetched: true,
    account: input.account ?? 'nostro-default',
    balance: 100000
  }),
  'tool.swift.outbound.prepare': async (input) => ({
    prepared: true,
    messageType: input.messageType ?? 'MT103',
    dispatchState: 'NOT_SENT'
  })
};

export interface ToolInvocationResult {
  id: number;
  status: string;
  attemptCount: number;
  response: ToolResponse | null;
  deduplicated: boolean;
}

export class ToolRuntime {
  constructor(private readonly prismaClient: ToolRuntimePrisma) {}

  async invokeTool(params: {
    agentStepId: number;
    toolName: string;
    idempotencyKey: string;
    request: ToolRequest;
  }): Promise<ToolInvocationResult> {
    const existing = await this.prismaClient.toolInvocation.findUnique({
      where: {
        agentStepId_idempotencyKey: {
          agentStepId: params.agentStepId,
          idempotencyKey: params.idempotencyKey
        }
      }
    });

    if (existing) {
      return {
        id: existing.id,
        status: existing.status,
        attemptCount: existing.attemptCount,
        response: (existing.response as ToolResponse | null) ?? null,
        deduplicated: true
      };
    }

    const tool = await this.prismaClient.toolRegistry.findUnique({ where: { toolName: params.toolName } });
    if (!tool || !tool.enabled) {
      throw new Error(`Tool ${params.toolName} is not available`);
    }

    const retryPolicy = tool.retryPolicy as { maxAttempts?: number };
    const maxAttempts = Math.max(1, retryPolicy.maxAttempts ?? 1);

    const invocation = await this.prismaClient.toolInvocation.create({
      data: {
        agentStepId: params.agentStepId,
        toolName: params.toolName,
        idempotencyKey: params.idempotencyKey,
        request: params.request,
        status: 'PENDING',
        attemptCount: 0
      }
    });

    const connector = connectors[params.toolName];
    if (!connector) {
      const failed = await this.prismaClient.toolInvocation.update({
        where: { id: invocation.id },
        data: { status: 'FAILED', attemptCount: 1, response: { error: 'Connector not found' } }
      });
      return {
        id: failed.id,
        status: failed.status,
        attemptCount: failed.attemptCount,
        response: failed.response as ToolResponse,
        deduplicated: false
      };
    }

    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        const response = await connector(params.request);
        const success = await this.prismaClient.toolInvocation.update({
          where: { id: invocation.id },
          data: { status: 'SUCCESS', attemptCount: attempt, response }
        });

        return {
          id: success.id,
          status: success.status,
          attemptCount: success.attemptCount,
          response: success.response as ToolResponse,
          deduplicated: false
        };
      } catch (error) {
        const isLastAttempt = attempt >= maxAttempts;
        const failureResponse = { error: error instanceof Error ? error.message : 'Unknown tool error' };
        await this.prismaClient.toolInvocation.update({
          where: { id: invocation.id },
          data: { status: isLastAttempt ? 'FAILED' : 'RETRYING', attemptCount: attempt, response: failureResponse }
        });

        if (isLastAttempt) {
          return {
            id: invocation.id,
            status: 'FAILED',
            attemptCount: attempt,
            response: failureResponse,
            deduplicated: false
          };
        }
      }
    }

    return {
      id: invocation.id,
      status: 'FAILED',
      attemptCount: maxAttempts,
      response: { error: 'Retry exhaustion' },
      deduplicated: false
    };
  }
}
