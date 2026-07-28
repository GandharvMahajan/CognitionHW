import Link from 'next/link';
import { Card, PageHeader, StatusBadge, Table, Td } from '@fintech/ui';
import { apiGet } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import { requireSession } from '@/lib/session';
import { AuditTrail } from '@/components/audit-trail';
import { CommentThread } from '@/components/comment-thread';
import { RefundActions } from './refund-actions';

interface RefundDetail {
  id: string;
  reference: string;
  status: string;
  kind: string;
  amountMinor: number;
  currency: string;
  reason: string;
  version: number;
  attempts: number;
  lastError: string | null;
  providerReference: string | null;
  idempotencyKey: string;
  createdAt: string;
  requestedBy: { id: string; name: string };
  approvedBy: { id: string; name: string } | null;
  customer: { id: string; fullName: string; email: string };
  transaction: {
    reference: string;
    amountMinor: number;
    currency: string;
    paymentMethod: string;
    settled: boolean;
    description: string;
  };
  attemptLog: Array<{ id: string; attemptNumber: number; succeeded: boolean; providerReference: string | null; error: string | null; createdAt: string }>;
  customerTransactions: Array<{ id: string; reference: string; amountMinor: number; description: string; createdAt: string }>;
  customerRefunds: Array<{ id: string; reference: string; amountMinor: number; status: string; createdAt: string }>;
  comments: Array<{ id: string; body: string; createdAt: string; author: { name: string } }>;
  auditTrail: Array<{ id: string; action: string; summary: string; createdAt: string; actor: { name: string } | null }>;
}

export default async function RefundDetailPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const refund = await apiGet<RefundDetail>(`/api/refunds/${params.id}`);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Refund ${refund.reference}`}
        description={`${refund.customer.fullName} · ${refund.transaction.reference}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge value={refund.status} />
            <Link href="/console/refunds" className="text-sm text-blue-600 hover:underline">
              Back to refunds
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Refund">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Amount</dt>
                <dd className="text-lg font-semibold" data-testid="refund-amount">
                  {formatMoney(refund.amountMinor, refund.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Kind</dt>
                <dd className="font-medium">{refund.kind}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Requested by</dt>
                <dd className="font-medium">{refund.requestedBy.name}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Approved by</dt>
                <dd className="font-medium">{refund.approvedBy?.name ?? '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">Reason</dt>
                <dd>{refund.reason}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Provider reference</dt>
                <dd className="font-mono text-xs">{refund.providerReference ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Idempotency key</dt>
                <dd className="font-mono text-xs">{refund.idempotencyKey}</dd>
              </div>
              {refund.lastError ? (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500">Last error</dt>
                  <dd className="text-red-600">{refund.lastError}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          <Card title="Transaction">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Original amount</dt>
                <dd className="font-medium">{formatMoney(refund.transaction.amountMinor, refund.transaction.currency)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Payment method</dt>
                <dd className="font-medium">{refund.transaction.paymentMethod}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Settled</dt>
                <dd className="font-medium">{refund.transaction.settled ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Description</dt>
                <dd className="font-medium">{refund.transaction.description}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Customer history">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Transactions</h3>
            <Table headers={['Reference', 'Amount', 'Description', 'Date']}>
              {refund.customerTransactions.map((transaction) => (
                <tr key={transaction.id}>
                  <Td className="font-mono text-xs">{transaction.reference}</Td>
                  <Td>{formatMoney(transaction.amountMinor, refund.currency)}</Td>
                  <Td className="text-xs text-slate-500">{transaction.description}</Td>
                  <Td className="text-xs text-slate-500">{formatDateTime(transaction.createdAt)}</Td>
                </tr>
              ))}
            </Table>
            <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Other refunds</h3>
            {refund.customerRefunds.length === 0 ? (
              <p className="text-sm text-slate-500">No other refunds for this customer.</p>
            ) : (
              <Table headers={['Reference', 'Amount', 'Status', 'Date']}>
                {refund.customerRefunds.map((other) => (
                  <tr key={other.id}>
                    <Td className="font-mono text-xs">{other.reference}</Td>
                    <Td>{formatMoney(other.amountMinor, refund.currency)}</Td>
                    <Td>
                      <StatusBadge value={other.status} />
                    </Td>
                    <Td className="text-xs text-slate-500">{formatDateTime(other.createdAt)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Execution attempts">
            {refund.attemptLog.length === 0 ? (
              <p className="text-sm text-slate-500">No provider calls yet.</p>
            ) : (
              <Table headers={['#', 'Result', 'Provider reference', 'Error', 'When']}>
                {refund.attemptLog.map((attempt) => (
                  <tr key={attempt.id}>
                    <Td>{attempt.attemptNumber}</Td>
                    <Td>
                      <StatusBadge value={attempt.succeeded ? 'SUCCEEDED' : 'FAILED'} />
                    </Td>
                    <Td className="font-mono text-xs">{attempt.providerReference ?? '—'}</Td>
                    <Td className="text-xs text-red-600">{attempt.error ?? '—'}</Td>
                    <Td className="text-xs text-slate-500">{formatDateTime(attempt.createdAt)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Comments">
            <CommentThread
              endpoint={`/api/refunds/${refund.id}/comments`}
              comments={refund.comments}
              canComment={user.permissions.includes('refund.request')}
            />
          </Card>

          <Card title="Audit trail">
            <AuditTrail events={refund.auditTrail} />
          </Card>
        </div>

        <div>
          <Card title="Actions">
            <RefundActions
              refundId={refund.id}
              status={refund.status}
              version={refund.version}
              amountMinor={refund.amountMinor}
              attempts={refund.attempts}
              requestedById={refund.requestedBy.id}
              currentUserId={user.id}
              permissions={user.permissions}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
