import { auditQuerySchema } from '@fintech/domain';
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../auth/middleware.js';
import { asyncHandler } from '../../http/async-handler.js';
import { parseQuery } from '../../http/validate.js';
import { prisma } from '../../services/db.js';

export const auditRouter: Router = Router();

auditRouter.get(
  '/',
  requireAuth,
  requirePermission('audit.read'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, entityType, entityId, actorId, action } = parseQuery(
      auditQuerySchema,
      req,
    );
    const where = {
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(actorId ? { actorId } : {}),
      ...(action ? { action: { contains: action } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditEvent.count({ where }),
    ]);
    res.json({ items, total, page, pageSize });
  }),
);
