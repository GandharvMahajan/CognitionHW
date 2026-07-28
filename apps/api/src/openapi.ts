import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import {
  assignCaseSchema,
  auditQuerySchema,
  commentSchema,
  createFlagSchema,
  createRefundSchema,
  documentReviewSchema,
  escalateSchema,
  flagChangeDecisionSchema,
  flagChangeRequestSchema,
  flagQuerySchema,
  killSwitchSchema,
  kycCaseQuerySchema,
  kycDecisionSchema,
  loginSchema,
  reconcileSchema,
  refundDecisionSchema,
  refundQuerySchema,
  refundRetrySchema,
  requestInfoSchema,
  rollbackSchema,
} from '@fintech/domain';
import { z } from 'zod';

extendZodWithOpenApi(z);

const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

type Method = 'get' | 'post';

interface RouteSpec {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  permission?: string;
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: string[];
  status?: number;
}

const ROUTES: RouteSpec[] = [
  { method: 'post', path: '/api/auth/login', tag: 'Auth', summary: 'Sign in and receive a session cookie', body: loginSchema },
  { method: 'post', path: '/api/auth/logout', tag: 'Auth', summary: 'Sign out', status: 204 },
  { method: 'get', path: '/api/auth/me', tag: 'Auth', summary: 'Current principal with resolved permissions' },
  { method: 'get', path: '/api/auth/users', tag: 'Auth', summary: 'Active users (for assignment pickers)' },

  { method: 'get', path: '/api/kyc/metrics', tag: 'KYC', summary: 'Queue metrics by status, risk and SLA', permission: 'kyc.case.read' },
  { method: 'get', path: '/api/kyc/cases', tag: 'KYC', summary: 'Search and filter the case queue', permission: 'kyc.case.read', query: kycCaseQuerySchema },
  { method: 'get', path: '/api/kyc/cases/{id}', tag: 'KYC', summary: 'Case workspace with documents, comments and audit history', permission: 'kyc.case.read', params: ['id'] },
  { method: 'post', path: '/api/kyc/cases/{id}/assign', tag: 'KYC', summary: 'Assign a case to a reviewer', permission: 'kyc.case.assign', params: ['id'], body: assignCaseSchema },
  { method: 'post', path: '/api/kyc/cases/{id}/start-review', tag: 'KYC', summary: 'Move a case into review', permission: 'kyc.case.review', params: ['id'], body: z.object({ expectedVersion: z.number().int() }) },
  { method: 'post', path: '/api/kyc/cases/{id}/request-info', tag: 'KYC', summary: 'Request more information from the customer', permission: 'kyc.case.review', params: ['id'], body: requestInfoSchema },
  { method: 'post', path: '/api/kyc/cases/{id}/escalate', tag: 'KYC', summary: 'Escalate a case to approvers', permission: 'kyc.case.escalate', params: ['id'], body: escalateSchema },
  { method: 'post', path: '/api/kyc/cases/{id}/decision', tag: 'KYC', summary: 'Approve or reject a case', permission: 'kyc.case.decide', params: ['id'], body: kycDecisionSchema },
  { method: 'post', path: '/api/kyc/cases/{id}/documents/{documentId}/review', tag: 'KYC', summary: 'Accept or reject a document', permission: 'kyc.case.review', params: ['id', 'documentId'], body: documentReviewSchema },
  { method: 'post', path: '/api/kyc/cases/{id}/comments', tag: 'KYC', summary: 'Comment on a case', permission: 'kyc.comment.create', params: ['id'], body: commentSchema, status: 201 },

  { method: 'get', path: '/api/refunds/metrics', tag: 'Refunds', summary: 'Refund volume, value and backlog metrics', permission: 'refund.read' },
  { method: 'get', path: '/api/refunds/transactions', tag: 'Refunds', summary: 'Search settled transactions', permission: 'refund.read' },
  { method: 'get', path: '/api/refunds', tag: 'Refunds', summary: 'Search and filter refunds', permission: 'refund.read', query: refundQuerySchema },
  { method: 'get', path: '/api/refunds/{id}', tag: 'Refunds', summary: 'Refund detail with attempts, customer history and audit trail', permission: 'refund.read', params: ['id'] },
  { method: 'post', path: '/api/refunds', tag: 'Refunds', summary: 'Request a full or partial refund (idempotent)', permission: 'refund.request', body: createRefundSchema, status: 201 },
  { method: 'post', path: '/api/refunds/{id}/decision', tag: 'Refunds', summary: 'Approve or reject a refund (maker-checker)', permission: 'refund.approve', params: ['id'], body: refundDecisionSchema },
  { method: 'post', path: '/api/refunds/{id}/execute', tag: 'Refunds', summary: 'Execute an approved refund against the provider', permission: 'refund.execute', params: ['id'] },
  { method: 'post', path: '/api/refunds/{id}/retry', tag: 'Refunds', summary: 'Retry a failed refund', permission: 'refund.retry', params: ['id'], body: refundRetrySchema },
  { method: 'post', path: '/api/refunds/{id}/reconcile', tag: 'Refunds', summary: 'Reconcile a succeeded refund with the provider ledger', permission: 'refund.reconcile', params: ['id'], body: reconcileSchema },
  { method: 'post', path: '/api/refunds/{id}/comments', tag: 'Refunds', summary: 'Comment on a refund', permission: 'refund.request', params: ['id'], body: commentSchema, status: 201 },

  { method: 'get', path: '/api/flags', tag: 'Feature flags', summary: 'Flag inventory by service and environment', permission: 'flag.read', query: flagQuerySchema },
  { method: 'get', path: '/api/flags/changes/pending', tag: 'Feature flags', summary: 'Changes awaiting approval or scheduled', permission: 'flag.read' },
  { method: 'get', path: '/api/flags/{id}', tag: 'Feature flags', summary: 'Flag detail with change history and audit trail', permission: 'flag.read', params: ['id'] },
  { method: 'post', path: '/api/flags', tag: 'Feature flags', summary: 'Create a flag', permission: 'user.manage', body: createFlagSchema, status: 201 },
  { method: 'post', path: '/api/flags/{id}/changes', tag: 'Feature flags', summary: 'Request a toggle, rollout or scheduled change', permission: 'flag.change.request', params: ['id'], body: flagChangeRequestSchema, status: 201 },
  { method: 'post', path: '/api/flags/changes/{changeId}/decision', tag: 'Feature flags', summary: 'Approve or reject a pending change', permission: 'flag.change.approve', params: ['changeId'], body: flagChangeDecisionSchema },
  { method: 'post', path: '/api/flags/{id}/rollback', tag: 'Feature flags', summary: 'Roll a flag back to its previous state', permission: 'flag.rollback', params: ['id'], body: rollbackSchema },
  { method: 'post', path: '/api/flags/{id}/kill-switch', tag: 'Feature flags', summary: 'Emergency kill switch (reason mandatory)', permission: 'flag.killswitch', params: ['id'], body: killSwitchSchema },
  { method: 'post', path: '/api/flags/{id}/kill-switch/release', tag: 'Feature flags', summary: 'Release an engaged kill switch', permission: 'flag.killswitch', params: ['id'] },

  { method: 'get', path: '/api/audit', tag: 'Audit', summary: 'Immutable audit event stream', permission: 'audit.read', query: auditQuerySchema },
  { method: 'get', path: '/api/notifications', tag: 'Notifications', summary: 'Notifications for the current user' },
  { method: 'post', path: '/api/notifications/{id}/read', tag: 'Notifications', summary: 'Mark a notification as read', params: ['id'], status: 204 },
];

export function buildOpenApiDocument(): object {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'fintech_session',
  });
  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
  });

  for (const route of ROUTES) {
    registry.registerPath({
      method: route.method,
      path: route.path,
      tags: [route.tag],
      summary: route.summary,
      description: route.permission ? `Requires permission \`${route.permission}\`.` : undefined,
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      request: {
        ...(route.query ? { query: route.query as z.ZodObject<z.ZodRawShape> } : {}),
        ...(route.params
          ? {
              params: z.object(
                Object.fromEntries(route.params.map((p) => [p, z.string()])) as z.ZodRawShape,
              ),
            }
          : {}),
        ...(route.body
          ? { body: { content: { 'application/json': { schema: route.body } }, required: true } }
          : {}),
      },
      responses: {
        [route.status ?? 200]: {
          description: 'Success',
          ...(route.status === 204
            ? {}
            : { content: { 'application/json': { schema: z.unknown() } } }),
        },
        401: { description: 'Unauthenticated', content: { 'application/json': { schema: errorSchema } } },
        403: { description: 'Forbidden or maker-checker violation', content: { 'application/json': { schema: errorSchema } } },
        409: { description: 'Invalid transition, stale write or duplicate request', content: { 'application/json': { schema: errorSchema } } },
        422: { description: 'Validation error', content: { 'application/json': { schema: errorSchema } } },
      },
    });
  }

  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Fintech Operations Console API',
      version: '1.0.0',
      description:
        'Command APIs for the KYC review queue, refunds dashboard and feature-flag admin panel. ' +
        'All sensitive actions are server-side: the UI submits commands and the API owns state ' +
        'transitions, approvals and immutable audit events.',
    },
    servers: [{ url: 'http://localhost:4000' }],
  });
}
