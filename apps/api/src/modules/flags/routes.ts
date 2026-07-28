import {
  createFlagSchema,
  flagChangeDecisionSchema,
  flagChangeRequestSchema,
  flagQuerySchema,
  killSwitchSchema,
  reasonSchema,
  rollbackSchema,
} from '@fintech/domain';
import { Router } from 'express';
import { z } from 'zod';
import { principalOf, requireAuth, requirePermission } from '../../auth/middleware.js';
import { asyncHandler } from '../../http/async-handler.js';
import { parseBody, parseQuery } from '../../http/validate.js';
import * as service from './service.js';

export const flagsRouter: Router = Router();

flagsRouter.use(requireAuth);

flagsRouter.get(
  '/',
  requirePermission('flag.read'),
  asyncHandler(async (req, res) => {
    res.json(await service.listFlags(parseQuery(flagQuerySchema, req)));
  }),
);

flagsRouter.get(
  '/changes/pending',
  requirePermission('flag.read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: await service.listPendingChanges() });
  }),
);

flagsRouter.get(
  '/:id',
  requirePermission('flag.read'),
  asyncHandler(async (req, res) => {
    res.json(await service.getFlag(req.params.id));
  }),
);

flagsRouter.post(
  '/',
  requirePermission('user.manage'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createFlag(principalOf(req), parseBody(createFlagSchema, req)));
  }),
);

flagsRouter.post(
  '/:id/changes',
  requirePermission('flag.change.request'),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await service.requestFlagChange(
          req.params.id,
          principalOf(req),
          parseBody(flagChangeRequestSchema, req),
        ),
      );
  }),
);

flagsRouter.post(
  '/changes/:changeId/decision',
  requirePermission('flag.change.approve'),
  asyncHandler(async (req, res) => {
    res.json(
      await service.decideFlagChange(
        req.params.changeId,
        principalOf(req),
        parseBody(flagChangeDecisionSchema, req),
      ),
    );
  }),
);

flagsRouter.post(
  '/:id/rollback',
  requirePermission('flag.rollback'),
  asyncHandler(async (req, res) => {
    res.json(await service.rollbackFlag(req.params.id, principalOf(req), parseBody(rollbackSchema, req)));
  }),
);

flagsRouter.post(
  '/:id/kill-switch',
  requirePermission('flag.killswitch'),
  asyncHandler(async (req, res) => {
    res.json(
      await service.engageKillSwitch(req.params.id, principalOf(req), parseBody(killSwitchSchema, req)),
    );
  }),
);

flagsRouter.post(
  '/:id/kill-switch/release',
  requirePermission('flag.killswitch'),
  asyncHandler(async (req, res) => {
    const { reason } = parseBody(z.object({ reason: reasonSchema }), req);
    res.json(await service.releaseKillSwitch(req.params.id, principalOf(req), reason));
  }),
);
