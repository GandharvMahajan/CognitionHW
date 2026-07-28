import { AppError } from '@fintech/domain';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger.js';

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: err.flatten() },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}
