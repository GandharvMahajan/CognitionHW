import Link from 'next/link';
import { Card, Metric, PageHeader, StatusBadge, Table, Td } from '@fintech/ui';
import { apiGet } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { requireSession } from '@/lib/session';
import { FlagFilters } from './flag-filters';
import { PendingChangeActions } from './pending-change-actions';

interface FlagRow {
  id: string;
  key: string;
  service: string;
  environment: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  killSwitchEngaged: boolean;
  version: number;
  updatedAt: string;
}

interface FlagList {
  items: FlagRow[];
  total: number;
  page: number;
  pageSize: number;
  services: string[];
}

interface PendingChange {
  id: string;
  kind: string;
  status: string;
  reason: string;
  scheduledFor: string | null;
  createdAt: string;
  afterState: { enabled: boolean; rolloutPercentage: number };
  flag: { id: string; key: string; environment: string };
  requestedBy: { id: string; name: string };
}

export default async function FlagsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = await requireSession();
  const params = new URLSearchParams();
  for (const key of ['q', 'service', 'environment', 'enabled', 'page'] as const) {
    const value = searchParams[key];
    if (value) params.set(key, value);
  }
  const query = params.toString();

  const [list, pending] = await Promise.all([
    apiGet<FlagList>(`/api/flags${query ? `?${query}` : ''}`),
    apiGet<{ items: PendingChange[] }>('/api/flags/changes/pending'),
  ]);

  const production = list.items.filter((flag) => flag.environment === 'production');

  return (
    <div className="space-y-6">
      <PageHeader title="Feature flags" description="Inventory, rollout and emergency controls per service and environment" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Flags" value={list.total} />
        <Metric label="Production flags" value={production.length} />
        <Metric label="Enabled" value={list.items.filter((flag) => flag.enabled).length} />
        <Metric
          label="Kill switches engaged"
          value={list.items.filter((flag) => flag.killSwitchEngaged).length}
          tone={list.items.some((flag) => flag.killSwitchEngaged) ? 'danger' : 'default'}
        />
      </div>

      <Card title={`Awaiting approval or scheduled (${pending.items.length})`}>
        {pending.items.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing is waiting.</p>
        ) : (
          <ul className="space-y-3">
            {pending.items.map((change) => (
              <li key={change.id} className="rounded-md border border-slate-200 p-3" data-testid="pending-change">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link href={`/console/flags/${change.flag.id}`} className="font-medium text-slate-900 hover:underline">
                      {change.flag.key}
                    </Link>
                    <span className="ml-2 text-xs text-slate-500">{change.flag.environment}</span>
                    <p className="text-xs text-slate-500">
                      {change.kind} → enabled={String(change.afterState.enabled)}, rollout={change.afterState.rolloutPercentage}% ·
                      requested by {change.requestedBy.name} · {formatDateTime(change.createdAt)}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{change.reason}</p>
                  </div>
                  <StatusBadge value={change.status} />
                </div>
                {change.status === 'PENDING_APPROVAL' && user.permissions.includes('flag.change.approve') ? (
                  <PendingChangeActions
                    changeId={change.id}
                    isMaker={change.requestedBy.id === user.id}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Filters">
        <FlagFilters services={list.services} initial={searchParams} />
      </Card>

      <Card title={`Flag inventory (${list.total})`}>
        <Table headers={['Key', 'Service', 'Environment', 'State', 'Rollout', 'Updated', '']}>
          {list.items.map((flag) => (
            <tr key={flag.id} data-testid="flag-row">
              <Td>
                <span className="font-medium text-slate-900">{flag.key}</span>
                <span className="block text-xs text-slate-400">{flag.description}</span>
              </Td>
              <Td>{flag.service}</Td>
              <Td>
                <StatusBadge value={flag.environment === 'production' ? 'CRITICAL' : 'NEW'} label={flag.environment} />
              </Td>
              <Td>
                {flag.killSwitchEngaged ? (
                  <StatusBadge value="REJECTED" label="Kill switch" />
                ) : (
                  <StatusBadge value={flag.enabled ? 'APPROVED' : 'NEW'} label={flag.enabled ? 'enabled' : 'disabled'} />
                )}
              </Td>
              <Td>{flag.rolloutPercentage}%</Td>
              <Td className="text-xs text-slate-500">{formatDateTime(flag.updatedAt)}</Td>
              <Td>
                <Link href={`/console/flags/${flag.id}`} className="text-sm text-blue-600 hover:underline">
                  Manage
                </Link>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
