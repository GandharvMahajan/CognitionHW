'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { REFUND_STATUSES } from '@fintech/domain';
import { Button, Field, Input, Select } from '@fintech/ui';

export function RefundFilters({ initial }: { initial: Record<string, string | undefined> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initial.q ?? '');
  const [minAmount, setMinAmount] = useState(initial.minAmountMinor ?? '');

  function update(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete('page');
    router.push(`/console/refunds?${params.toString()}`);
  }

  return (
    <form
      className="grid gap-3 md:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        update({ q, minAmountMinor: minAmount });
      }}
    >
      <Field label="Search">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Refund or transaction reference" />
      </Field>
      <Field label="Status">
        <Select defaultValue={initial.status ?? ''} onChange={(e) => update({ status: e.target.value })}>
          <option value="">All</option>
          {REFUND_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Kind">
        <Select defaultValue={initial.kind ?? ''} onChange={(e) => update({ kind: e.target.value })}>
          <option value="">All</option>
          <option value="FULL">Full</option>
          <option value="PARTIAL">Partial</option>
        </Select>
      </Field>
      <Field label="Minimum amount (minor units)">
        <Input value={minAmount} onChange={(e) => setMinAmount(e.target.value)} inputMode="numeric" placeholder="10000" />
      </Field>
      <div className="flex items-end gap-2 md:col-span-4">
        <Button type="submit">Apply</Button>
        <Button type="button" variant="secondary" onClick={() => router.push('/console/refunds')}>
          Reset
        </Button>
      </div>
    </form>
  );
}
