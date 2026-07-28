'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Permission } from '@fintech/domain';
import { Button, ErrorMessage, Field, Input, Textarea } from '@fintech/ui';
import { submitCommand } from '@/lib/command';

interface Props {
  flagId: string;
  environment: string;
  version: number;
  enabled: boolean;
  rolloutPercentage: number;
  killSwitchEngaged: boolean;
  permissions: Permission[];
}

export function FlagControls({ flagId, environment, version, enabled, rolloutPercentage, killSwitchEngaged, permissions }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [rollout, setRollout] = useState(String(rolloutPercentage));
  const [scheduledFor, setScheduledFor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const can = (permission: Permission) => permissions.includes(permission);
  const isProduction = environment === 'production';

  async function run(path: string, body: Record<string, unknown>, successMessage?: string) {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await submitCommand<{ change?: { status: string } }>(path, body);
    setPending(false);
    if (!result.ok) {
      setError(`${result.errorCode}: ${result.errorMessage}`);
      return;
    }
    const status = result.data?.change?.status;
    setNotice(status ? `Change recorded with status ${status}.` : (successMessage ?? 'Done.'));
    setReason('');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {isProduction ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Production changes are queued for a second approver before they take effect.
        </p>
      ) : null}
      {killSwitchEngaged ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          The kill switch is engaged. Release it before making any other change.
        </p>
      ) : null}

      <ErrorMessage>{error}</ErrorMessage>
      {notice ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p> : null}

      <Field label="Reason" hint="Required on every change, stored in the audit trail">
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Change reason" />
      </Field>

      {can('flag.change.request') ? (
        <div className="space-y-3">
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => run(`/api/flags/${flagId}/changes`, { kind: 'TOGGLE', enabled: !enabled, reason, expectedVersion: version })}
          >
            {enabled ? 'Request disable' : 'Request enable'}
          </Button>

          <Field label="Rollout percentage">
            <Input value={rollout} onChange={(e) => setRollout(e.target.value)} inputMode="numeric" aria-label="Rollout percentage" />
          </Field>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              run(`/api/flags/${flagId}/changes`, {
                kind: 'ROLLOUT',
                rolloutPercentage: Number(rollout),
                reason,
                expectedVersion: version,
              })
            }
          >
            Request rollout change
          </Button>

          <Field label="Schedule for" hint="Applied automatically by the background worker">
            <Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} aria-label="Schedule for" />
          </Field>
          <Button
            variant="secondary"
            disabled={pending || !scheduledFor}
            onClick={() =>
              run(`/api/flags/${flagId}/changes`, {
                kind: 'SCHEDULE',
                enabled: true,
                rolloutPercentage: Number(rollout),
                scheduledFor: new Date(scheduledFor).toISOString(),
                reason,
                expectedVersion: version,
              })
            }
          >
            Schedule change
          </Button>
        </div>
      ) : null}

      {can('flag.rollback') ? (
        <Button variant="secondary" disabled={pending} onClick={() => run(`/api/flags/${flagId}/rollback`, { reason }, 'Rolled back.')}>
          Roll back last change
        </Button>
      ) : null}

      {can('flag.killswitch') ? (
        <div className="border-t border-slate-100 pt-4">
          {killSwitchEngaged ? (
            <Button variant="secondary" disabled={pending} onClick={() => run(`/api/flags/${flagId}/kill-switch/release`, { reason }, 'Kill switch released.')}>
              Release kill switch
            </Button>
          ) : (
            <Button variant="danger" disabled={pending} onClick={() => run(`/api/flags/${flagId}/kill-switch`, { reason, expectedVersion: version }, 'Kill switch engaged.')}>
              Engage emergency kill switch
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
