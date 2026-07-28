import type { ReactNode } from 'react';
import { requireSession } from '@/lib/session';
import { ConsoleNav } from '@/components/console-nav';
import { SessionMenu } from '@/components/session-menu';
import { NotificationBell } from '@/components/notification-bell';
import { apiGet } from '@/lib/api';

interface NotificationsResponse {
  unread: number;
  items: Array<{ id: string; title: string; body: string; createdAt: string; readAt: string | null }>;
}

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const user = await requireSession();
  const notifications = await apiGet<NotificationsResponse>('/api/notifications');

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r">
        <div className="px-4 py-4">
          <p className="text-sm font-semibold text-slate-900">Fintech Ops Console</p>
          <p className="text-xs text-slate-500">{user.roles.join(', ')}</p>
        </div>
        <ConsoleNav permissions={user.permissions} />
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3">
          <div className="text-sm text-slate-500">Signed in as {user.name}</div>
          <div className="flex items-center gap-3">
            <NotificationBell unread={notifications.unread} items={notifications.items} />
            <SessionMenu email={user.email} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
