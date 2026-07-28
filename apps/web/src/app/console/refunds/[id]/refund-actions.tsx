'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ADMIN_APPROVAL_THRESHOLD_MINOR, MAX_REFUND_ATTEMPTS, type Permission } from '@fintech/domain';
import { Button, ErrorMessage, Field, Input, Textarea } from '@fintech/ui';
import { submitCommand } from '@/lib/command';
import { formatMoney } from '@/lib/format';

interface Props {
  refundId: string;
  status: string;
  version: number;
  amountMinor: number;
  attempts: number;
  requestedById: string;
  currentUserId: string;
  permissions: Permission[];
}

export function RefundActions({ refundId, status, version, amountMinor, attempts, requestedById, currentUserId, permissions }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [providerReference, setProviderReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const can = (permission: Permission) => permissions.includes(permission);
  const isMaker = requestedById === currentUserId;

  async function run(path: string, body: Record<string, unknown>) {
    setPending(true);
    setError(null);
    const result = await submitCommand(path, body);
    setPending(false);
    if (!result.ok) {
      setError(`${result.errorCode}: ${result.errorMessage}`);
      return;
    }
    setReason('');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ErrorMessage>{error}</ErrorMessage>

      {status === 'PENDING_APPROVAL' && can('refund.approve') ? (
        <div className="space-y-2">
          {isMaker ? (
            <p className="text-xs text-amber-700">Maker-checker: you requested this refund, so someone else must approve it.</p>
          ) : null}
          {amountMinor > ADMIN_APPROVAL_THRESHOLD_MINOR ? (
            <p className="text-xs text-amber-700">
              Above {formatMoney(ADMIN_APPROVAL_THRESHOLD_MINOR)} an administrator must approve this refund.
            </p>
          ) : null}
          <Field label="Decision reason">
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Decision reason" />
          </Field>
          <div className="flex gap-2">
            <Button disabled={pending} onClick={() => run(`/api/refunds/${refundId}/decision`, { decision: 'APPROVE', reason, expectedVersion: version })}>
              Approve
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => run(`/api/refunds/${refundId}/decision`, { decision: 'REJECT', reason, expectedVersion: version })}>
              Reject
            </Button>
          </div>
        </div>
      ) : null}

      {status === 'FAILED' && can('refund.retry') ? (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">
            Attempt {attempts} of {MAX_REFUND_ATTEMPTS}. Retries reuse the original idempotency key so the provider never pays twice.
          </p>
          <Field label="Retry reason">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Retry reason" />
          </Field>
          <Button variant="secondary" disabled={pending} onClick={() => run(`/api/refunds/${refundId}/retry`, { reason, expectedVersion: version })}>
            Retry refund
          </Button>
        </div>
      ) : null}

      {status === 'APPROVED' && can('refund.execute') ? (
        <Button variant="secondary" disabled={pending} onClick={() => run(`/api/refunds/${refundId}/execute`, {})}>
          Execute now
        </Button>
      ) : null}

      {status === 'SUCCEEDED' && can('refund.reconcile') ? (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <Field label="Provider settlement reference">
            <Input value={providerReference} onChange={(e) => setProviderReference(e.target.value)} aria-label="Provider reference" />
          </Field>
          <Button variant="secondary" disabled={pending} onClick={() => run(`/api/refunds/${refundId}/reconcile`, { providerReference, note: reason || undefined })}>
            Mark reconciled
          </Button>
        </div>
      ) : null}

      {['REJECTED', 'RECONCILED', 'CANCELLED'].includes(status) ? (
        <p className="text-sm text-slate-500">This refund is closed.</p>
      ) : null}
    </div>
  );
}
