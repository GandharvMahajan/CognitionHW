'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Input, Select } from '@fintech/ui';

const ENTITY_TYPES = ['KYC_CASE', 'KYC_DOCUMENT', 'REFUND', 'FEATURE_FLAG', 'FLAG_CHANGE', 'USER'];

export function AuditFilters({ initial }: { initial: Record<string, string | undefined> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [action, setAction] = useState(initial.action ?? '');
  const [entityId, setEntityId] = useState(initial.entityId ?? '');

  function update(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete('page');
    router.push(`/console/audit?${params.toString()}`);
  }

  return (
    <form
      className="grid gap-3 md:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        update({ action, entityId });
      }}
    >
      <Field label="Action">
        <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="refund.approved" />
      </Field>
      <Field label="Entity type">
        <Select defaultValue={initial.entityType ?? ''} onChange={(e) => update({ entityType: e.target.value })}>
          <option value="">All</option>
          {ENTITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Entity id">
        <Input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="cuid" />
      </Field>
      <div className="flex items-end gap-2 md:col-span-3">
        <Button type="submit">Apply</Button>
        <Button type="button" variant="secondary" onClick={() => router.push('/console/audit')}>
          Reset
        </Button>
      </div>
    </form>
  );
}
