'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@fintech/ui';
import { submitCommand } from '@/lib/command';
import { relativeTime } from '@/lib/format';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export function NotificationBell({ unread, items }: { unread: number; items: NotificationItem[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function markRead(id: string) {
    await submitCommand(`/api/notifications/${id}/read`);
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications (${unread} unread)`}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        Inbox {unread > 0 ? <Badge tone="danger">{unread}</Badge> : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 max-h-96 w-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {items.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-slate-500">Nothing here yet</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="rounded-md px-2 py-2 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">{item.title}</p>
                  {item.readAt ? null : (
                    <button type="button" onClick={() => markRead(item.id)} className="text-xs text-blue-600 hover:underline">
                      Mark read
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-600">{item.body}</p>
                <p className="text-[11px] text-slate-400">{relativeTime(item.createdAt)}</p>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
