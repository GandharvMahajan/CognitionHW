import { AppError, type Permission, type Principal, can } from '@fintech/domain';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { loadConfig } from '../config.js';
import { verifySession } from './jwt.js';

function readToken(req: Request): string | null {
  const config = loadConfig();
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[config.COOKIE_NAME];
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
  return null;
}

/** Populates req.principal when a valid session exists; never rejects. */
export const attachPrincipal: RequestHandler = (req, _res, next) => {
  const token = readToken(req);
  if (token) {
    const claims = verifySession(token);
    if (claims) {
      req.principal = { id: claims.sub, email: claims.email, name: claims.name, roles: claims.roles };
    }
  }
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.principal) {
    next(new AppError('UNAUTHENTICATED', 'Authentication required'));
    return;
  }
  next();
};

export function requirePermission(permission: Permission): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.principal) {
      next(new AppError('UNAUTHENTICATED', 'Authentication required'));
      return;
    }
    if (!can(req.principal, permission)) {
      next(new AppError('FORBIDDEN', `Missing required permission: ${permission}`));
      return;
    }
    next();
  };
}

export function principalOf(req: Request): Principal {
  if (!req.principal) throw new AppError('UNAUTHENTICATED', 'Authentication required');
  return req.principal;
}
