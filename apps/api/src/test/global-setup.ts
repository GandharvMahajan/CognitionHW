import { execSync } from 'node:child_process';

const DEFAULT_TEST_DB =
  'postgresql://postgres:postgres@localhost:5432/fintech_test?schema=public';

export default function globalSetup(): void {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DB;
  process.env.JWT_SECRET ??= 'test-secret-value';
  execSync('pnpm --filter @fintech/db exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env },
  });
}
