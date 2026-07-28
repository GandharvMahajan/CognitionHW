import type { EntityType } from '@fintech/db';
import type { Db } from './db.js';

export interface NotificationInput {
  userIds: string[];
  type: string;
  title: string;
  body: string;
  entityType: EntityType;
  entityId: string;
}

export async function notifyUsers(db: Db, input: NotificationInput): Promise<void> {
  if (input.userIds.length === 0) return;
  await db.notification.createMany({
    data: input.userIds.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
    })),
  });
}

/** Fan-out target for approval requests: everyone who could act as the checker. */
export async function usersWithRole(db: Db, role: 'APPROVER' | 'ADMIN'): Promise<string[]> {
  const users = await db.user.findMany({
    where: { isActive: true, roles: { has: role } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
