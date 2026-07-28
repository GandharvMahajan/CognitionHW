import { z } from 'zod';
import { KYC_STATUSES } from '../kyc/state-machine.js';
import { RISK_LEVELS } from '../kyc/risk.js';
import { idSchema, noteSchema, paginationSchema, reasonSchema } from './common.js';

export const kycCaseQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  status: z.enum(KYC_STATUSES).optional(),
  risk: z.enum(RISK_LEVELS).optional(),
  assigneeId: z.string().optional(),
  slaBreached: z.coerce.boolean().optional(),
  sort: z.enum(['createdAt', 'slaDueAt', 'riskScore']).default('slaDueAt'),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type KycCaseQuery = z.infer<typeof kycCaseQuerySchema>;

export const assignCaseSchema = z.object({ assigneeId: idSchema });
export type AssignCaseInput = z.infer<typeof assignCaseSchema>;

export const kycDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: reasonSchema,
  expectedVersion: z.number().int().min(0),
});
export type KycDecisionInput = z.infer<typeof kycDecisionSchema>;

export const requestInfoSchema = z.object({
  reason: reasonSchema,
  requestedDocuments: z.array(z.string().min(1)).min(1).max(20),
  expectedVersion: z.number().int().min(0),
});
export type RequestInfoInput = z.infer<typeof requestInfoSchema>;

export const escalateSchema = z.object({
  reason: reasonSchema,
  expectedVersion: z.number().int().min(0),
});
export type EscalateInput = z.infer<typeof escalateSchema>;

export const startReviewSchema = z.object({ expectedVersion: z.number().int().min(0) });

export const commentSchema = z.object({ body: noteSchema });
export type CommentInput = z.infer<typeof commentSchema>;

export const documentReviewSchema = z.object({
  verdict: z.enum(['ACCEPTED', 'REJECTED']),
  note: z.string().trim().max(1000).optional(),
});
export type DocumentReviewInput = z.infer<typeof documentReviewSchema>;
