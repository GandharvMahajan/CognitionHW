import { beforeAll } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/fintech_test?schema=public';
  process.env.JWT_SECRET ??= 'test-secret-value';
  process.env.WORKER_ENABLED = 'false';
  process.env.PROVIDER_FAILURE_RATE = '0';
});
