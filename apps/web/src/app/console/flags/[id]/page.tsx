import Link from 'next/link';
import { Card, PageHeader, StatusBadge, Table, Td } from '@fintech/ui';
import { apiGet } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { requireSession } from '@/lib/session';
import { AuditTrail } from '@/components/audit-trail';
import { FlagControls } from './flag-controls';

interface FlagDetail {
  id: string;
  key: string;
  service: string;
  environment: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  killSwitchEngaged: boolean;
  version: number;
  updatedAt: string;
  changes: Array<{
    id: string;
    kind: string;
    status: string;
    reason: string;
    decisionReason: string | null;
    scheduledFor: string | null;
    appliedAt: string | null;
    createdAt: string;
    beforeState: { enabled: boolean; rolloutPercentage: number };
    afterState: { enabled: boolean; rolloutPercentage: number };
    requestedBy: { id: string; name: string };
    approvedBy: { id: string; name: string } | null;
  }>;
  auditTrail: Array<{ id: string; action: string; summary: string; createdAt: string; actor: { name: string } | null }>;
}

export default async function FlagDetailPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const flag = await apiGet<FlagDetail>(`/api/flags/${params.id}`);

  return (
    <div className="space-y-6">
      <PageHeader
        title={flag.key}
        description={`${flag.service} · ${flag.environment} · v${flag.version}`}
        actions={
          <div className="flex items-center gap-2">
            {flag.killSwitchEngaged ? <StatusBadge value="REJECTED" label="Kill switch engaged" /> : null}
            <StatusBadge value={flag.enabled ? 'APPROVED' : 'NEW'} label={flag.enabled ? 'enabled' : 'disabled'} />
            <span className="text-sm text-slate-500" data-testid="flag-rollout">
              {flag.rolloutPercentage}% rollout
            </span>
            <Link href="/console/flags" className="text-sm text-blue-600 hover:underline">
              Back to flags
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Change history">
            {flag.changes.length === 0 ? (
              <p className="text-sm text-slate-500">No changes recorded yet.</p>
            ) : (
              <Table headers={['Kind', 'Status', 'From → To', 'Requested by', 'Approved by', 'When']}>
                {flag.changes.map((change) => (
                  <tr key={change.id}>
                    <Td>{change.kind}</Td>
                    <Td>
                      <StatusBadge value={change.status} />
                    </Td>
                    <Td className="text-xs">
                      {String(change.beforeState.enabled)}/{change.beforeState.rolloutPercentage}% →{' '}
                      {String(change.afterState.enabled)}/{change.afterState.rolloutPercentage}%
                    </Td>
                    <Td className="text-xs">{change.requestedBy.name}</Td>
                    <Td className="text-xs">{change.approvedBy?.name ?? '—'}</Td>
                    <Td className="text-xs text-slate-500">
                      {change.scheduledFor ? `scheduled ${formatDateTime(change.scheduledFor)}` : formatDateTime(change.createdAt)}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Audit trail">
            <AuditTrail events={flag.auditTrail} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Change controls">
            <FlagControls
              flagId={flag.id}
              environment={flag.environment}
              version={flag.version}
              enabled={flag.enabled}
              rolloutPercentage={flag.rolloutPercentage}
              killSwitchEngaged={flag.killSwitchEngaged}
              permissions={user.permissions}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
