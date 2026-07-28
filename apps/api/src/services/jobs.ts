import type { Prisma } from '@fintech/db';
import { logger } from '../logger.js';
import type { Db } from './db.js';
import { prisma } from './db.js';

export const JOB_TYPES = [
  'flag.apply_scheduled_change',
  'kyc.sla_breach_sweep',
  'refund.execute',
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

const handlers = new Map<JobType, JobHandler>();

export function registerJobHandler(type: JobType, handler: JobHandler): void {
  handlers.set(type, handler);
}

export async function enqueueJob(
  db: Db,
  type: JobType,
  payload: Record<string, unknown>,
  runAt: Date = new Date(),
): Promise<string> {
  const job = await db.job.create({
    data: { type, payload: payload as Prisma.InputJsonValue, runAt },
  });
  return job.id;
}

const MAX_JOB_ATTEMPTS = 5;

/** Claims and runs every due job. Returns how many jobs were processed. */
export async function runDueJobs(now: Date = new Date()): Promise<number> {
  const due = await prisma.job.findMany({
    where: { status: 'PENDING', runAt: { lte: now } },
    orderBy: { runAt: 'asc' },
    take: 25,
  });

  let processed = 0;
  for (const job of due) {
    // Optimistic claim: only one worker can flip PENDING -> RUNNING.
    const claimed = await prisma.job.updateMany({
      where: { id: job.id, status: 'PENDING' },
      data: { status: 'RUNNING', lockedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;

    const handler = handlers.get(job.type as JobType);
    if (!handler) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'FAILED', lastError: `No handler registered for ${job.type}` },
      });
      continue;
    }

    try {
      await handler((job.payload ?? {}) as Record<string, unknown>);
      await prisma.job.update({ where: { id: job.id }, data: { status: 'DONE', lastError: null } });
      processed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = job.attempts + 1;
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: attempts >= MAX_JOB_ATTEMPTS ? 'FAILED' : 'PENDING',
          lastError: message,
          lockedAt: null,
          runAt: new Date(Date.now() + Math.min(2 ** attempts, 60) * 1000),
        },
      });
      logger.warn({ jobId: job.id, type: job.type, err: message }, 'Job failed');
    }
  }
  return processed;
}

export function startWorker(intervalMs: number): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runDueJobs()
      .catch((err) => logger.error({ err }, 'Worker tick failed'))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
