import { z } from 'zod';
import { REFUND_STATUSES } from '../refunds/state-machine.js';
import { paginationSchema, reasonSchema } from './common.js';

export const refundQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  status: z.enum(REFUND_STATUSES).optional(),
  customerId: z.string().optional(),
  minAmountMinor: z.coerce.number().int().min(0).optional(),
  maxAmountMinor: z.coerce.number().int().min(0).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sort: z.enum(['createdAt', 'amountMinor']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type RefundQuery = z.infer<typeof refundQuerySchema>;

export const createRefundSchema = z.object({
  transactionId: z.string().min(1),
  amountMinor: z.number().int().positive(),
  kind: z.enum(['FULL', 'PARTIAL']),
  reason: reasonSchema,
  idempotencyKey: z.string().min(8).max(128),
});
export type CreateRefundInput = z.infer<typeof createRefundSchema>;

export const refundDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: reasonSchema,
  expectedVersion: z.number().int().min(0),
});
export type RefundDecisionInput = z.infer<typeof refundDecisionSchema>;

export const refundRetrySchema = z.object({
  reason: reasonSchema,
  expectedVersion: z.number().int().min(0),
});
export type RefundRetryInput = z.infer<typeof refundRetrySchema>;

export const reconcileSchema = z.object({
  providerReference: z.string().min(1),
  note: z.string().trim().max(1000).optional(),
});
export type ReconcileInput = z.infer<typeof reconcileSchema>;
