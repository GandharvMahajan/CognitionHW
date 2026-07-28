import type { Role } from '@fintech/domain';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../config.js';

export interface SessionClaims {
  sub: string;
  email: string;
  name: string;
  roles: Role[];
}

export function signSession(claims: SessionClaims): string {
  const config = loadConfig();
  return jwt.sign(claims, config.JWT_SECRET, { expiresIn: config.JWT_TTL_SECONDS });
}

export function verifySession(token: string): SessionClaims | null {
  const config = loadConfig();
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    if (typeof decoded === 'string') return null;
    const { sub, email, name, roles } = decoded as jwt.JwtPayload & Omit<SessionClaims, 'sub'>;
    if (typeof sub !== 'string' || typeof email !== 'string' || !Array.isArray(roles)) return null;
    return { sub, email, name, roles };
  } catch {
    return null;
  }
}
