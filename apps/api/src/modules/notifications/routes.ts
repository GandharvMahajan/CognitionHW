import { Router } from 'express';
import { principalOf, requireAuth } from '../../auth/middleware.js';
import { asyncHandler } from '../../http/async-handler.js';
import { prisma } from '../../services/db.js';

export const notificationsRouter: Router = Router();

notificationsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const principal = principalOf(req);
    const items = await prisma.notification.findMany({
      where: { userId: principal.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ items, unread: items.filter((n) => n.readAt === null).length });
  }),
);

notificationsRouter.post(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const principal = principalOf(req);
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: principal.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.status(204).send();
  }),
);
