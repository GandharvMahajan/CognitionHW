import Link from 'next/link';
import { Card, Metric, PageHeader, StatusBadge, Table, Td } from '@fintech/ui';
import { apiGet } from '@/lib/api';
import { formatDateTime, relativeTime } from '@/lib/format';
import { requireSession } from '@/lib/session';
import { QueueFilters } from './queue-filters';

interface CaseRow {
  id: string;
  reference: string;
  status: string;
  riskLevel: string;
  riskScore: number;
  slaDueAt: string;
  slaState: string;
  createdAt: string;
  customer: { fullName: string; email: string; country: string };
  assignee: { id: string; name: string } | null;
}

interface CaseList {
  items: CaseRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface KycMetrics {
  byStatus: Record<string, number>;
  byRisk: Record<string, number>;
  slaBreached: number;
  unassigned: number;
}

export default async function KycQueuePage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireSession();
  const params = new URLSearchParams();
  for (const key of ['q', 'status', 'risk', 'assigneeId', 'slaBreached', 'page'] as const) {
    const value = searchParams[key];
    if (value) params.set(key, value);
  }
  const query = params.toString();

  const [list, metrics, users] = await Promise.all([
    apiGet<CaseList>(`/api/kyc/cases${query ? `?${query}` : ''}`),
    apiGet<KycMetrics>('/api/kyc/metrics'),
    apiGet<{ users: Array<{ id: string; name: string; roles: string[] }> }>('/api/auth/users'),
  ]);

  const pageCount = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <div className="space-y-6">
      <PageHeader title="KYC review queue" description="Search, filter and work the onboarding backlog" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total cases" value={list.total} />
        <Metric label="Unassigned" value={metrics.unassigned} />
        <Metric label="SLA breached" value={metrics.slaBreached} tone={metrics.slaBreached ? 'danger' : 'default'} />
        <Metric label="High / critical risk" value={(metrics.byRisk.HIGH ?? 0) + (metrics.byRisk.CRITICAL ?? 0)} tone="warning" />
      </div>

      <Card title="Filters">
        <QueueFilters users={users.users} initial={searchParams} />
      </Card>

      <Card title={`Cases (${list.total})`}>
        {list.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No cases match these filters.</p>
        ) : (
          <Table headers={['Reference', 'Customer', 'Risk', 'Status', 'Assignee', 'SLA', '']}>
            {list.items.map((row) => (
              <tr key={row.id} data-testid="kyc-case-row">
                <Td>
                  <span className="font-medium text-slate-900">{row.reference}</span>
                  <span className="block text-xs text-slate-400">{formatDateTime(row.createdAt)}</span>
                </Td>
                <Td>
                  <span className="block">{row.customer.fullName}</span>
                  <span className="block text-xs text-slate-400">
                    {row.customer.email} · {row.customer.country}
                  </span>
                </Td>
                <Td>
                  <StatusBadge value={row.riskLevel} label={`${row.riskLevel} ${row.riskScore}`} />
                </Td>
                <Td>
                  <StatusBadge value={row.status} />
                </Td>
                <Td>{row.assignee?.name ?? <span className="text-slate-400">Unassigned</span>}</Td>
                <Td>
                  <StatusBadge value={row.slaState} />
                  <span className="block text-xs text-slate-400">{relativeTime(row.slaDueAt)}</span>
                </Td>
                <Td>
                  <Link href={`/console/kyc/${row.id}`} className="text-sm text-blue-600 hover:underline">
                    Open
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
        )}

        {pageCount > 1 ? (
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
            <span className="text-slate-500">
              Page {list.page} of {pageCount}
            </span>
            <div className="flex gap-2">
              {list.page > 1 ? (
                <Link className="rounded-md border border-slate-300 px-3 py-1" href={`/console/kyc?${new URLSearchParams({ ...searchParams, page: String(list.page - 1) } as Record<string, string>)}`}>
                  Previous
                </Link>
              ) : null}
              {list.page < pageCount ? (
                <Link className="rounded-md border border-slate-300 px-3 py-1" href={`/console/kyc?${new URLSearchParams({ ...searchParams, page: String(list.page + 1) } as Record<string, string>)}`}>
                  Next
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}
      </Card>
    </div>
  );
}
