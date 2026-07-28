import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  JWT_TTL_SECONDS: z.coerce.number().int().default(60 * 60 * 8),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  COOKIE_NAME: z.string().default('fintech_session'),
  WORKER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  WORKER_INTERVAL_MS: z.coerce.number().int().default(5000),
  /** Failure rate of the mocked payment provider, used to exercise retries in demos. */
  PROVIDER_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetConfigCache(): void {
  cached = null;
}
