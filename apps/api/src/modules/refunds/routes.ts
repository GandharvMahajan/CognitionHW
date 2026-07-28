import {
  commentSchema,
  createRefundSchema,
  reconcileSchema,
  refundDecisionSchema,
  refundQuerySchema,
  refundRetrySchema,
} from '@fintech/domain';
import { Router } from 'express';
import { z } from 'zod';
import { principalOf, requireAuth, requirePermission } from '../../auth/middleware.js';
import { asyncHandler } from '../../http/async-handler.js';
import { parseBody, parseQuery } from '../../http/validate.js';
import * as service from './service.js';

export const refundsRouter: Router = Router();

refundsRouter.use(requireAuth);

refundsRouter.get(
  '/metrics',
  requirePermission('refund.read'),
  asyncHandler(async (_req, res) => {
    res.json(await service.refundMetrics());
  }),
);

refundsRouter.get(
  '/transactions',
  requirePermission('refund.read'),
  asyncHandler(async (req, res) => {
    const { q, customerId } = parseQuery(
      z.object({ q: z.string().optional(), customerId: z.string().optional() }),
      req,
    );
    res.json({ items: await service.listTransactions(q, customerId) });
  }),
);

refundsRouter.get(
  '/',
  requirePermission('refund.read'),
  asyncHandler(async (req, res) => {
    res.json(await service.listRefunds(parseQuery(refundQuerySchema, req)));
  }),
);

refundsRouter.get(
  '/:id',
  requirePermission('refund.read'),
  asyncHandler(async (req, res) => {
    res.json(await service.getRefund(req.params.id));
  }),
);

refundsRouter.post(
  '/',
  requirePermission('refund.request'),
  asyncHandler(async (req, res) => {
    const { refund, idempotentReplay } = await service.createRefund(
      principalOf(req),
      parseBody(createRefundSchema, req),
    );
    res.status(idempotentReplay ? 200 : 201).json({ refund, idempotentReplay });
  }),
);

refundsRouter.post(
  '/:id/decision',
  requirePermission('refund.approve'),
  asyncHandler(async (req, res) => {
    res.json(
      await service.decideRefund(req.params.id, principalOf(req), parseBody(refundDecisionSchema, req)),
    );
  }),
);

refundsRouter.post(
  '/:id/execute',
  requirePermission('refund.execute'),
  asyncHandler(async (req, res) => {
    res.json(await service.executeRefund(req.params.id, principalOf(req).id));
  }),
);

refundsRouter.post(
  '/:id/retry',
  requirePermission('refund.retry'),
  asyncHandler(async (req, res) => {
    res.json(await service.retryRefund(req.params.id, principalOf(req), parseBody(refundRetrySchema, req)));
  }),
);

refundsRouter.post(
  '/:id/reconcile',
  requirePermission('refund.reconcile'),
  asyncHandler(async (req, res) => {
    res.json(
      await service.reconcileRefund(req.params.id, principalOf(req), parseBody(reconcileSchema, req)),
    );
  }),
);

refundsRouter.post(
  '/:id/comments',
  requirePermission('refund.request'),
  asyncHandler(async (req, res) => {
    const { body } = parseBody(commentSchema, req);
    res.status(201).json(await service.addRefundComment(req.params.id, principalOf(req), body));
  }),
);
