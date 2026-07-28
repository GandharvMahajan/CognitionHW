export type AppErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INVALID_TRANSITION'
  | 'STALE_WRITE'
  | 'DUPLICATE_REQUEST'
  | 'CONFLICT'
  | 'MAKER_CHECKER_VIOLATION'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export const ERROR_STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  INVALID_TRANSITION: 409,
  STALE_WRITE: 409,
  DUPLICATE_REQUEST: 409,
  CONFLICT: 409,
  MAKER_CHECKER_VIOLATION: 403,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}

export const forbidden = (message = 'Insufficient permissions') => new AppError('FORBIDDEN', message);
export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} not found`);
export const staleWrite = (message = 'Resource was modified by someone else') =>
  new AppError('STALE_WRITE', message);
export const invalidTransition = (from: string, to: string) =>
  new AppError('INVALID_TRANSITION', `Cannot transition from ${from} to ${to}`);
