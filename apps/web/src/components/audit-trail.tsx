import { formatDateTime } from '@/lib/format';

interface AuditEventRow {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  actor: { name: string } | null;
}

export function AuditTrail({ events }: { events: AuditEventRow[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">No audit events yet.</p>;

  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="border-l-2 border-slate-200 pl-3">
          <p className="text-sm text-slate-800">{event.summary}</p>
          <p className="text-xs text-slate-500">
            <code>{event.action}</code> · {event.actor?.name ?? 'system'} · {formatDateTime(event.createdAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}
