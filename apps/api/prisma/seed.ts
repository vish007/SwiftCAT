import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const roles = ['Maker', 'Compliance', 'AI_Agent'] as const;

  for (const roleName of roles) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName }
    });
  }

  const maker = await prisma.role.findUniqueOrThrow({ where: { name: 'Maker' } });
  const compliance = await prisma.role.findUniqueOrThrow({ where: { name: 'Compliance' } });
  const aiAgent = await prisma.role.findUniqueOrThrow({ where: { name: 'AI_Agent' } });

  const permissionsByRole: Record<string, string[]> = {
    Maker: ['queue.read', 'queue.write'],
    Compliance: ['audit.read', 'queue.read'],
    AI_Agent: ['queue.read', 'action.write']
  };

  for (const [roleName, permissions] of Object.entries(permissionsByRole)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    for (const code of permissions) {
      await prisma.permission.upsert({
        where: { code },
        update: { roleId: role.id },
        create: {
          code,
          description: `${code} permission`,
          roleId: role.id
        }
      });
    }
  }

  const users = [
    { username: 'amira', password: 'password123', roleId: maker.id },
    { username: 'john', password: 'password123', roleId: compliance.id },
    { username: 'swiftcat_ai', password: 'password123', roleId: aiAgent.id }
  ];

  for (const user of users) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    await prisma.user.upsert({
      where: { username: user.username },
      update: { passwordHash, roleId: user.roleId },
      create: {
        username: user.username,
        passwordHash,
        roleId: user.roleId
      }
    });
  }

  await prisma.queue.upsert({
    where: { name: 'incoming-swift' },
    update: {},
    create: { name: 'incoming-swift' }
  });

  await prisma.swiftMtCode.upsert({
    where: { code: 'MT103' },
    update: {},
    create: { code: 'MT103', description: 'Single customer credit transfer' }
  });

  const tools = [
    {
      toolName: 'tool.sanctions.screen',
      domain: 'sanctions',
      inputSchema: { type: 'object', required: ['entity'] },
      outputSchema: { type: 'object', required: ['screened', 'match'] },
      requiresApproval: true,
      retryPolicy: { maxAttempts: 2 },
      enabled: true
    },
    {
      toolName: 'tool.cbs.payment.post',
      domain: 'cbs',
      inputSchema: { type: 'object', required: ['paymentId'] },
      outputSchema: { type: 'object', required: ['posted', 'paymentReference'] },
      requiresApproval: true,
      retryPolicy: { maxAttempts: 3 },
      enabled: true
    },
    {
      toolName: 'tool.trade.case.create',
      domain: 'trade',
      inputSchema: { type: 'object', required: ['tradeId'] },
      outputSchema: { type: 'object', required: ['created', 'caseId'] },
      requiresApproval: false,
      retryPolicy: { maxAttempts: 2 },
      enabled: true
    },
    {
      toolName: 'tool.treasury.nostro.fetch',
      domain: 'treasury',
      inputSchema: { type: 'object', required: ['account'] },
      outputSchema: { type: 'object', required: ['fetched', 'balance'] },
      requiresApproval: false,
      retryPolicy: { maxAttempts: 2 },
      enabled: true
    },
    {
      toolName: 'tool.swift.outbound.prepare',
      domain: 'swift',
      inputSchema: { type: 'object', required: ['messageType'] },
      outputSchema: { type: 'object', required: ['prepared', 'dispatchState'] },
      requiresApproval: true,
      retryPolicy: { maxAttempts: 2 },
      enabled: true
    }
  ] as const;

  for (const tool of tools) {
    await prisma.toolRegistry.upsert({
      where: { toolName: tool.toolName },
      update: {
        domain: tool.domain,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        requiresApproval: tool.requiresApproval,
        retryPolicy: tool.retryPolicy,
        enabled: tool.enabled
      },
      create: tool
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
