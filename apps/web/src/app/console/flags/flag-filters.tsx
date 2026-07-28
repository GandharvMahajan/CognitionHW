'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ENVIRONMENTS } from '@fintech/domain';
import { Button, Field, Input, Select } from '@fintech/ui';

export function FlagFilters({ services, initial }: { services: string[]; initial: Record<string, string | undefined> }) {
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
    router.push(`/console/flags?${params.toString()}`);
  }

  return (
    <form
      className="grid gap-3 md:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        update({ q });
      }}
    >
      <Field label="Search">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Flag key or description" />
      </Field>
      <Field label="Service">
        <Select defaultValue={initial.service ?? ''} onChange={(e) => update({ service: e.target.value })}>
          <option value="">All services</option>
          {services.map((service) => (
            <option key={service} value={service}>
              {service}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Environment">
        <Select defaultValue={initial.environment ?? ''} onChange={(e) => update({ environment: e.target.value })}>
          <option value="">All environments</option>
          {ENVIRONMENTS.map((environment) => (
            <option key={environment} value={environment}>
              {environment}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="State">
        <Select defaultValue={initial.enabled ?? ''} onChange={(e) => update({ enabled: e.target.value })}>
          <option value="">Any</option>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </Select>
      </Field>
      <div className="flex items-end gap-2 md:col-span-4">
        <Button type="submit">Apply</Button>
        <Button type="button" variant="secondary" onClick={() => router.push('/console/flags')}>
          Reset
        </Button>
      </div>
    </form>
  );
}
