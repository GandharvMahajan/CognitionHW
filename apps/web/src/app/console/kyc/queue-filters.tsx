'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { KYC_STATUSES, RISK_LEVELS } from '@fintech/domain';
import { Button, Field, Input, Select } from '@fintech/ui';

export function QueueFilters({
  users,
  initial,
}: {
  users: Array<{ id: string; name: string; roles: string[] }>;
  initial: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initial.q ?? '');

  function update(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete('page');
    router.push(`/console/kyc?${params.toString()}`);
  }

  return (
    <form
      className="grid gap-3 md:grid-cols-5"
      onSubmit={(event) => {
        event.preventDefault();
        update({ q });
      }}
    >
      <Field label="Search">
        <Input name="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, name or email" />
      </Field>
      <Field label="Status">
        <Select name="status" defaultValue={initial.status ?? ''} onChange={(e) => update({ status: e.target.value })}>
          <option value="">All</option>
          {KYC_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Risk">
        <Select name="risk" defaultValue={initial.risk ?? ''} onChange={(e) => update({ risk: e.target.value })}>
          <option value="">All</option>
          {RISK_LEVELS.map((risk) => (
            <option key={risk} value={risk}>
              {risk}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Assignee">
        <Select name="assigneeId" defaultValue={initial.assigneeId ?? ''} onChange={(e) => update({ assigneeId: e.target.value })}>
          <option value="">Anyone</option>
          <option value="unassigned">Unassigned</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="SLA">
        <Select name="slaBreached" defaultValue={initial.slaBreached ?? ''} onChange={(e) => update({ slaBreached: e.target.value })}>
          <option value="">All</option>
          <option value="true">Breached only</option>
        </Select>
      </Field>
      <div className="flex items-end gap-2 md:col-span-5">
        <Button type="submit">Apply search</Button>
        <Button type="button" variant="secondary" onClick={() => router.push('/console/kyc')}>
          Reset
        </Button>
      </div>
    </form>
  );
}
