import { AppError, loginSchema, permissionsFor, type Role } from '@fintech/domain';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loadConfig } from '../../config.js';
import { signSession } from '../../auth/jwt.js';
import { principalOf, requireAuth } from '../../auth/middleware.js';
import { verifyPassword } from '../../auth/password.js';
import { asyncHandler } from '../../http/async-handler.js';
import { parseBody } from '../../http/validate.js';
import { recordAudit } from '../../services/audit.js';
import { prisma } from '../../services/db.js';

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts' } },
});

export const authRouter: Router = Router();

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const config = loadConfig();
    const { email, password } = parseBody(loginSchema, req);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive || !(await verifyPassword(user.passwordHash, password))) {
      throw new AppError('UNAUTHENTICATED', 'Invalid email or password');
    }

    const token = signSession({
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles as Role[],
    });
    res.cookie(config.COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      maxAge: config.JWT_TTL_SECONDS * 1000,
      path: '/',
    });

    await recordAudit(prisma, {
      action: 'auth.login',
      entityType: 'USER',
      entityId: user.id,
      actorId: user.id,
      summary: `${user.email} signed in`,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        permissions: [...permissionsFor(user.roles as Role[])],
      },
    });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const config = loadConfig();
    if (req.principal) {
      await recordAudit(prisma, {
        action: 'auth.logout',
        entityType: 'USER',
        entityId: req.principal.id,
        actorId: req.principal.id,
        summary: `${req.principal.email} signed out`,
      });
    }
    res.clearCookie(config.COOKIE_NAME, { path: '/' });
    res.status(204).send();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const principal = principalOf(req);
    const user = await prisma.user.findUnique({ where: { id: principal.id } });
    if (!user || !user.isActive) throw new AppError('UNAUTHENTICATED', 'Session is no longer valid');
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        permissions: [...permissionsFor(user.roles as Role[])],
      },
    });
  }),
);

authRouter.get(
  '/users',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, roles: true },
      orderBy: { name: 'asc' },
    });
    res.json({ users });
  }),
);
