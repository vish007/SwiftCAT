import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT ?? 3001),
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? 'access-secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? 'refresh-secret',
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgresql://swiftcat:swiftcat@localhost:5432/swiftcat?schema=public',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173'
};
