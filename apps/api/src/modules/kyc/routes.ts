import {
  assignCaseSchema,
  commentSchema,
  documentReviewSchema,
  escalateSchema,
  kycCaseQuerySchema,
  kycDecisionSchema,
  requestInfoSchema,
  startReviewSchema,
} from '@fintech/domain';
import { Router } from 'express';
import { principalOf, requireAuth, requirePermission } from '../../auth/middleware.js';
import { asyncHandler } from '../../http/async-handler.js';
import { parseBody, parseQuery } from '../../http/validate.js';
import * as service from './service.js';

export const kycRouter: Router = Router();

kycRouter.use(requireAuth);

kycRouter.get(
  '/metrics',
  requirePermission('kyc.case.read'),
  asyncHandler(async (_req, res) => {
    res.json(await service.queueMetrics());
  }),
);

kycRouter.get(
  '/cases',
  requirePermission('kyc.case.read'),
  asyncHandler(async (req, res) => {
    res.json(await service.listCases(parseQuery(kycCaseQuerySchema, req)));
  }),
);

kycRouter.get(
  '/cases/:id',
  requirePermission('kyc.case.read'),
  asyncHandler(async (req, res) => {
    res.json(await service.getCase(req.params.id));
  }),
);

kycRouter.post(
  '/cases/:id/assign',
  requirePermission('kyc.case.assign'),
  asyncHandler(async (req, res) => {
    const result = await service.assignCase(
      req.params.id,
      principalOf(req),
      parseBody(assignCaseSchema, req),
    );
    res.json(service.decorateCase(result));
  }),
);

kycRouter.post(
  '/cases/:id/start-review',
  requirePermission('kyc.case.review'),
  asyncHandler(async (req, res) => {
    const { expectedVersion } = parseBody(startReviewSchema, req);
    const result = await service.startReview(req.params.id, principalOf(req), expectedVersion);
    res.json(service.decorateCase(result));
  }),
);

kycRouter.post(
  '/cases/:id/request-info',
  requirePermission('kyc.case.review'),
  asyncHandler(async (req, res) => {
    const result = await service.requestInfo(
      req.params.id,
      principalOf(req),
      parseBody(requestInfoSchema, req),
    );
    res.json(service.decorateCase(result));
  }),
);

kycRouter.post(
  '/cases/:id/escalate',
  requirePermission('kyc.case.escalate'),
  asyncHandler(async (req, res) => {
    const result = await service.escalateCase(
      req.params.id,
      principalOf(req),
      parseBody(escalateSchema, req),
    );
    res.json(service.decorateCase(result));
  }),
);

kycRouter.post(
  '/cases/:id/decision',
  requirePermission('kyc.case.decide'),
  asyncHandler(async (req, res) => {
    const result = await service.decideCase(
      req.params.id,
      principalOf(req),
      parseBody(kycDecisionSchema, req),
    );
    res.json(service.decorateCase(result));
  }),
);

kycRouter.post(
  '/cases/:id/documents/:documentId/review',
  requirePermission('kyc.case.review'),
  asyncHandler(async (req, res) => {
    const result = await service.reviewDocument(
      req.params.id,
      req.params.documentId,
      principalOf(req),
      parseBody(documentReviewSchema, req),
    );
    res.json(result);
  }),
);

kycRouter.post(
  '/cases/:id/comments',
  requirePermission('kyc.comment.create'),
  asyncHandler(async (req, res) => {
    const result = await service.addComment(
      req.params.id,
      principalOf(req),
      parseBody(commentSchema, req),
    );
    res.status(201).json(result);
  }),
);
