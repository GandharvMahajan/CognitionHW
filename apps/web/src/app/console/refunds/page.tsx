import Link from 'next/link';
import { Card, Metric, PageHeader, StatusBadge, Table, Td } from '@fintech/ui';
import { apiGet } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import { requireSession } from '@/lib/session';
import { RefundFilters } from './refund-filters';
import { NewRefundForm } from './new-refund-form';

interface RefundRow {
  id: string;
  reference: string;
  status: string;
  kind: string;
  amountMinor: number;
  currency: string;
  attempts: number;
  createdAt: string;
  transaction: { reference: string };
  customer: { fullName: string };
  requestedBy: { name: string };
}

interface RefundList {
  items: RefundRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface RefundMetrics {
  totalCount: number;
  totalAmountMinor: number;
  refundedAmountMinor: number;
  pendingApproval: number;
  failed: number;
  last30Days: { count: number; amountMinor: number };
}

interface TransactionOption {
  id: string;
  reference: string;
  amountMinor: number;
  currency: string;
  settled: boolean;
  customer: { fullName: string };
  refunds: Array<{ amountMinor: number; status: string }>;
}

const NON_REFUNDING = ['REJECTED', 'CANCELLED'];

export default async function RefundsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = await requireSession();
  const params = new URLSearchParams();
  for (const key of ['q', 'status', 'minAmountMinor', 'page'] as const) {
    const value = searchParams[key];
    if (value) params.set(key, value);
  }
  const query = params.toString();

  const [list, metrics, transactions] = await Promise.all([
    apiGet<RefundList>(`/api/refunds${query ? `?${query}` : ''}`),
    apiGet<RefundMetrics>('/api/refunds/metrics'),
    apiGet<{ items: TransactionOption[] }>('/api/refunds/transactions'),
  ]);

  const refundable = transactions.items
    .filter((transaction) => transaction.settled)
    .map((transaction) => ({
      id: transaction.id,
      reference: transaction.reference,
      currency: transaction.currency,
      customerName: transaction.customer.fullName,
      remainingMinor:
        transaction.amountMinor -
        transaction.refunds
          .filter((refund) => !NON_REFUNDING.includes(refund.status))
          .reduce((sum, refund) => sum + refund.amountMinor, 0),
    }))
    .filter((transaction) => transaction.remainingMinor > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Refunds" description="Request, approve, execute and reconcile customer refunds" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Refunds" value={metrics.totalCount} hint={`${metrics.last30Days.count} in the last 30 days`} />
        <Metric label="Settled value" value={formatMoney(metrics.refundedAmountMinor)} />
        <Metric label="Awaiting approval" value={metrics.pendingApproval} tone={metrics.pendingApproval ? 'warning' : 'default'} />
        <Metric label="Failed" value={metrics.failed} tone={metrics.failed ? 'danger' : 'default'} />
      </div>

      {user.permissions.includes('refund.request') ? (
        <Card title="Request a refund">
          <NewRefundForm transactions={refundable} />
        </Card>
      ) : null}

      <Card title="Filters">
        <RefundFilters initial={searchParams} />
      </Card>

      <Card title={`Refund queue (${list.total})`}>
        {list.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No refunds match these filters.</p>
        ) : (
          <Table headers={['Reference', 'Customer', 'Amount', 'Kind', 'Status', 'Requested by', '']}>
            {list.items.map((refund) => (
              <tr key={refund.id} data-testid="refund-row">
                <Td>
                  <span className="font-medium text-slate-900">{refund.reference}</span>
                  <span className="block text-xs text-slate-400">
                    {refund.transaction.reference} · {formatDateTime(refund.createdAt)}
                  </span>
                </Td>
                <Td>{refund.customer.fullName}</Td>
                <Td className="font-medium">{formatMoney(refund.amountMinor, refund.currency)}</Td>
                <Td>{refund.kind}</Td>
                <Td>
                  <StatusBadge value={refund.status} />
                  {refund.attempts > 0 ? <span className="ml-1 text-xs text-slate-400">{refund.attempts} attempt(s)</span> : null}
                </Td>
                <Td className="text-xs text-slate-500">{refund.requestedBy.name}</Td>
                <Td>
                  <Link href={`/console/refunds/${refund.id}`} className="text-sm text-blue-600 hover:underline">
                    Open
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
