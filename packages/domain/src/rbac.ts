import type { Permission } from './permissions.js';
import type { Role } from './roles.js';

const READ_ONLY: Permission[] = [
  'kyc.case.read',
  'refund.read',
  'flag.read',
  'audit.read',
  'notification.read',
];

const REVIEWER: Permission[] = [
  ...READ_ONLY.filter((p) => p !== 'audit.read'),
  'kyc.case.assign',
  'kyc.case.review',
  'kyc.case.escalate',
  'kyc.comment.create',
  'refund.request',
  'flag.change.request',
];

const APPROVER: Permission[] = [
  ...REVIEWER,
  'audit.read',
  'kyc.case.decide',
  'refund.approve',
  'refund.retry',
  'flag.change.approve',
  'flag.rollback',
];

const ADMIN: Permission[] = [
  ...APPROVER,
  'refund.execute',
  'refund.reconcile',
  'flag.killswitch',
  'user.manage',
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  AUDITOR: new Set(READ_ONLY),
  REVIEWER: new Set(REVIEWER),
  APPROVER: new Set(APPROVER),
  ADMIN: new Set(ADMIN),
};

export interface Principal {
  id: string;
  email: string;
  name: string;
  roles: Role[];
}

export function permissionsFor(roles: Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) out.add(permission);
  }
  return out;
}

export function can(principal: Pick<Principal, 'roles'>, permission: Permission): boolean {
  return permissionsFor(principal.roles).has(permission);
}

export function canAll(principal: Pick<Principal, 'roles'>, permissions: Permission[]): boolean {
  const granted = permissionsFor(principal.roles);
  return permissions.every((p) => granted.has(p));
}

/**
 * Maker-checker: the actor who created a change may never approve it, regardless of role.
 */
export function violatesMakerChecker(requestedById: string, approverId: string): boolean {
  return requestedById === approverId;
}
