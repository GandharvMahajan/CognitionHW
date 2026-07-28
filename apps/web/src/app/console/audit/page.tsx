import { Card, PageHeader, Table, Td } from '@fintech/ui';
import { apiGet } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { requireSession } from '@/lib/session';
import { AuditFilters } from './audit-filters';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
}

interface AuditList {
  items: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
}

export default async function AuditPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  await requireSession();
  const params = new URLSearchParams();
  for (const key of ['action', 'entityType', 'entityId', 'actorId', 'page'] as const) {
    const value = searchParams[key];
    if (value) params.set(key, value);
  }
  const query = params.toString();
  const list = await apiGet<AuditList>(`/api/audit${query ? `?${query}` : ''}`);

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Append-only record of every sensitive action" />

      <Card title="Filters">
        <AuditFilters initial={searchParams} />
      </Card>

      <Card title={`Events (${list.total})`}>
        <Table headers={['When', 'Action', 'Entity', 'Actor', 'Summary']}>
          {list.items.map((event) => (
            <tr key={event.id} data-testid="audit-row">
              <Td className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(event.createdAt)}</Td>
              <Td>
                <code className="text-xs">{event.action}</code>
              </Td>
              <Td className="text-xs text-slate-500">
                {event.entityType}
                <span className="block font-mono">{event.entityId.slice(0, 10)}…</span>
              </Td>
              <Td className="text-xs">{event.actor?.name ?? 'system'}</Td>
              <Td>{event.summary}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
