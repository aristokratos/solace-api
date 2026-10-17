import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/** Fresh schema for every e2e run. Refuses to touch anything but a *_test database. */
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://solace:solace@localhost:5432/solace_test';
  if (!/\/\w+_test(\?|$)/.test(url)) throw new Error(`Refusing to reset non-test database: ${url}`);
  const prisma = new PrismaClient({ datasourceUrl: url });
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  await prisma.$disconnect();
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
}
