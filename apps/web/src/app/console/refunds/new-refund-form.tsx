'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorMessage, Field, Input, Select, Textarea } from '@fintech/ui';
import { submitCommand } from '@/lib/command';
import { formatMoney } from '@/lib/format';

export interface RefundableTransaction {
  id: string;
  reference: string;
  currency: string;
  customerName: string;
  remainingMinor: number;
}

export function NewRefundForm({ transactions }: { transactions: RefundableTransaction[] }) {
  const router = useRouter();
  const [transactionId, setTransactionId] = useState(transactions[0]?.id ?? '');
  const [kind, setKind] = useState<'FULL' | 'PARTIAL'>('PARTIAL');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // One key per form instance: a double submit replays instead of paying twice.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const selected = transactions.find((t) => t.id === transactionId);
  const remaining = selected?.remainingMinor ?? 0;

  if (transactions.length === 0) {
    return <p className="text-sm text-slate-500">No settled transactions are available to refund.</p>;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    const amountMinor = kind === 'FULL' ? remaining : Number(amount);
    const result = await submitCommand<{ refund: { reference: string; status: string }; idempotentReplay: boolean }>(
      '/api/refunds',
      { transactionId, kind, amountMinor, reason, idempotencyKey },
    );
    setPending(false);
    if (!result.ok) {
      setError(`${result.errorCode}: ${result.errorMessage}`);
      return;
    }
    setNotice(
      result.data?.idempotentReplay
        ? `Duplicate submission ignored — ${result.data.refund.reference} already exists.`
        : `Refund ${result.data?.refund.reference} created with status ${result.data?.refund.status}.`,
    );
    setAmount('');
    setReason('');
    setIdempotencyKey(crypto.randomUUID());
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
      <Field label="Transaction">
        <Select value={transactionId} onChange={(e) => setTransactionId(e.target.value)} aria-label="Transaction">
          {transactions.map((transaction) => (
            <option key={transaction.id} value={transaction.id}>
              {transaction.reference} — {transaction.customerName} ({formatMoney(transaction.remainingMinor, transaction.currency)} left)
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Kind">
        <Select value={kind} onChange={(e) => setKind(e.target.value as 'FULL' | 'PARTIAL')} aria-label="Refund kind">
          <option value="PARTIAL">Partial</option>
          <option value="FULL">Full</option>
        </Select>
      </Field>
      <Field label="Amount (minor units)" hint={selected ? `${formatMoney(remaining)} refundable` : undefined}>
        <Input
          value={kind === 'FULL' ? String(remaining) : amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={kind === 'FULL'}
          inputMode="numeric"
          aria-label="Refund amount"
          required={kind === 'PARTIAL'}
        />
      </Field>
      <Field label="Reason" hint="Refunds over $100.00 need a second approver">
        <Textarea rows={1} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Refund reason" required />
      </Field>
      <div className="md:col-span-4 space-y-2">
        <ErrorMessage>{error}</ErrorMessage>
        {notice ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Submitting...' : 'Submit refund request'}
        </Button>
      </div>
    </form>
  );
}
