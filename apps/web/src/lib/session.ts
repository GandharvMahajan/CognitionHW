import { redirect } from 'next/navigation';
import type { Permission, Role } from '@fintech/domain';
import { ApiError, apiGet } from './api';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  permissions: Permission[];
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const { user } = await apiGet<{ user: SessionUser }>('/api/auth/me');
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect('/login');
  return user;
}

export function hasPermission(user: SessionUser, permission: Permission): boolean {
  return user.permissions.includes(permission);
}
