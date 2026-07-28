import { z } from 'zod';
import { ROLES } from '../roles.js';

export const idSchema = z.string().min(1);
export const reasonSchema = z.string().trim().min(10, 'Provide a reason of at least 10 characters').max(2000);
export const noteSchema = z.string().trim().min(1).max(2000);

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const roleSchema = z.enum(ROLES);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const auditQuerySchema = paginationSchema.extend({
  entityType: z.enum(['KYC_CASE', 'REFUND', 'FEATURE_FLAG', 'FLAG_CHANGE', 'USER']).optional(),
  entityId: z.string().optional(),
  actorId: z.string().optional(),
  action: z.string().optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
