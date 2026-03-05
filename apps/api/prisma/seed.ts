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

  const queues = ['incoming-swift', 'payments-ops', 'trade-ops', 'reconciliation-ops', 'ops-review', 'compliance-review'];
  for (const queueName of queues) {
    await prisma.queue.upsert({
      where: { name: queueName },
      update: {},
      create: { name: queueName }
    });
  }

  await prisma.swiftMtCode.upsert({
    where: { code: 'MT103' },
    update: {},
    create: { code: 'MT103', description: 'Single customer credit transfer' }
  });

  await prisma.workItem.upsert({
    where: { reference: 'WI-1001' },
    update: {},
    create: { reference: 'WI-1001' }
  });
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
