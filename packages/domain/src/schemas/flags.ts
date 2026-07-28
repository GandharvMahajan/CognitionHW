import { z } from 'zod';
import { ENVIRONMENTS } from '../flags/policy.js';
import { paginationSchema, reasonSchema } from './common.js';

export const flagQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  service: z.string().optional(),
  environment: z.enum(ENVIRONMENTS).optional(),
  enabled: z.coerce.boolean().optional(),
});
export type FlagQuery = z.infer<typeof flagQuerySchema>;

export const createFlagSchema = z.object({
  key: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:[-.][a-z0-9]+)*$/, 'Use lowercase kebab/dot notation'),
  service: z.string().min(1).max(60),
  environment: z.enum(ENVIRONMENTS),
  description: z.string().trim().min(1).max(500),
  enabled: z.boolean().default(false),
  rolloutPercentage: z.number().int().min(0).max(100).default(0),
});
export type CreateFlagInput = z.infer<typeof createFlagSchema>;

export const flagChangeRequestSchema = z
  .object({
    kind: z.enum(['TOGGLE', 'ROLLOUT', 'SCHEDULE']),
    enabled: z.boolean().optional(),
    rolloutPercentage: z.number().int().min(0).max(100).optional(),
    scheduledFor: z.string().datetime().optional(),
    reason: reasonSchema,
    expectedVersion: z.number().int().min(0),
  })
  .refine((v) => v.kind !== 'TOGGLE' || typeof v.enabled === 'boolean', {
    message: 'enabled is required for TOGGLE changes',
    path: ['enabled'],
  })
  .refine((v) => v.kind !== 'ROLLOUT' || typeof v.rolloutPercentage === 'number', {
    message: 'rolloutPercentage is required for ROLLOUT changes',
    path: ['rolloutPercentage'],
  })
  .refine((v) => v.kind !== 'SCHEDULE' || Boolean(v.scheduledFor), {
    message: 'scheduledFor is required for SCHEDULE changes',
    path: ['scheduledFor'],
  });
export type FlagChangeRequestInput = z.infer<typeof flagChangeRequestSchema>;

export const flagChangeDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: reasonSchema,
});
export type FlagChangeDecisionInput = z.infer<typeof flagChangeDecisionSchema>;

export const killSwitchSchema = z.object({
  reason: reasonSchema,
  expectedVersion: z.number().int().min(0),
});
export type KillSwitchInput = z.infer<typeof killSwitchSchema>;

export const rollbackSchema = z.object({
  reason: reasonSchema,
  targetChangeId: z.string().min(1).optional(),
});
export type RollbackInput = z.infer<typeof rollbackSchema>;
