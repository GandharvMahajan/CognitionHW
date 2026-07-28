import Link from 'next/link';
import { Card, Metric, PageHeader, StatusBadge } from '@fintech/ui';
import { apiGet } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { requireSession } from '@/lib/session';

interface KycMetrics {
  byStatus: Record<string, number>;
  byRisk: Record<string, number>;
  slaBreached: number;
  unassigned: number;
}

interface RefundMetrics {
  totalCount: number;
  totalAmountMinor: number;
  refundedAmountMinor: number;
  pendingApproval: number;
  failed: number;
  last30Days: { count: number; amountMinor: number };
}

interface PendingChanges {
  items: Array<{
    id: string;
    kind: string;
    status: string;
    flag: { key: string; environment: string };
    requestedBy: { name: string };
  }>;
}

export default async function OverviewPage() {
  const user = await requireSession();
  const [kyc, refunds, changes] = await Promise.all([
    apiGet<KycMetrics>('/api/kyc/metrics'),
    apiGet<RefundMetrics>('/api/refunds/metrics'),
    apiGet<PendingChanges>('/api/flags/changes/pending'),
  ]);

  const openCases = Object.entries(kyc.byStatus)
    .filter(([status]) => status !== 'APPROVED' && status !== 'REJECTED')
    .reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${user.name}`} description="Operational snapshot across KYC, refunds and feature flags" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Open KYC cases" value={openCases} hint={`${kyc.unassigned} unassigned`} />
        <Metric label="SLA breached" value={kyc.slaBreached} tone={kyc.slaBreached > 0 ? 'danger' : 'default'} />
        <Metric label="Refunds awaiting approval" value={refunds.pendingApproval} tone={refunds.pendingApproval > 0 ? 'warning' : 'default'} />
        <Metric label="Failed refunds" value={refunds.failed} tone={refunds.failed > 0 ? 'danger' : 'default'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="KYC queue by status">
          <ul className="space-y-2">
            {Object.entries(kyc.byStatus).map(([status, count]) => (
              <li key={status} className="flex items-center justify-between">
                <StatusBadge value={status} />
                <span className="text-sm font-medium text-slate-700">{count}</span>
              </li>
            ))}
          </ul>
          <Link href="/console/kyc" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            Open the review queue
          </Link>
        </Card>

        <Card title="Refund value">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Refunds raised</dt>
              <dd className="font-medium">{refunds.totalCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Requested value</dt>
              <dd className="font-medium">{formatMoney(refunds.totalAmountMinor)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Settled value</dt>
              <dd className="font-medium">{formatMoney(refunds.refundedAmountMinor)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Last 30 days</dt>
              <dd className="font-medium">
                {refunds.last30Days.count} / {formatMoney(refunds.last30Days.amountMinor)}
              </dd>
            </div>
          </dl>
          <Link href="/console/refunds" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            Open the refunds dashboard
          </Link>
        </Card>

        <Card title="Flag changes awaiting action">
          {changes.items.length === 0 ? (
            <p className="text-sm text-slate-500">No production changes are waiting.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {changes.items.map((change) => (
                <li key={change.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    <span className="font-medium text-slate-800">{change.flag.key}</span>
                    <span className="text-slate-500"> · {change.flag.environment}</span>
                  </span>
                  <StatusBadge value={change.status} />
                </li>
              ))}
            </ul>
          )}
          <Link href="/console/flags" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            Open the flag admin panel
          </Link>
        </Card>
      </div>
    </div>
  );
}
