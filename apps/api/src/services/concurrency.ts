import { AppError } from '@fintech/domain';

/** Turns a zero-row optimistic update into a typed stale-write error. */
export function assertUpdated(count: number, entity: string): void {
  if (count === 0) {
    throw new AppError(
      'STALE_WRITE',
      `${entity} was modified by someone else. Reload and try again.`,
    );
  }
}
