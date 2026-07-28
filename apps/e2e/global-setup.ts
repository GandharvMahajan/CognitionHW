import { execSync } from 'node:child_process';
import path from 'node:path';

const databaseUrl =
  process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/fintech_e2e?schema=public';

/** Migrates and reseeds a dedicated e2e database so specs always start from known data. */
export default function globalSetup(): void {
  const dbPackage = path.resolve(__dirname, '../../packages/db');
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  execSync('pnpm exec prisma migrate deploy', { cwd: dbPackage, env, stdio: 'inherit' });
  execSync('pnpm exec tsx src/seed.ts', { cwd: dbPackage, env, stdio: 'inherit' });
}
