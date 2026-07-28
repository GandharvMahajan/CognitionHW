'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Permission } from '@fintech/domain';
import { Button, ErrorMessage, Field, Input, Select, Textarea } from '@fintech/ui';
import { submitCommand } from '@/lib/command';

interface Props {
  caseId: string;
  status: string;
  version: number;
  assigneeId: string | null;
  riskLevel: string;
  users: Array<{ id: string; name: string; roles: string[] }>;
  permissions: Permission[];
  currentUserId: string;
}

const TERMINAL = ['APPROVED', 'REJECTED'];

export function CaseActions({ caseId, status, version, assigneeId, riskLevel, users, permissions, currentUserId }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState('');
  const [documents, setDocuments] = useState('PROOF_OF_ADDRESS');
  const [assignee, setAssignee] = useState(assigneeId ?? users[0]?.id ?? '');

  const can = (permission: Permission) => permissions.includes(permission);
  const decided = TERMINAL.includes(status);
  const highRiskSelfDecision = (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') && assigneeId === currentUserId;

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

  if (decided) {
    return <p className="text-sm text-slate-500">This case is closed. No further actions are available.</p>;
  }

  return (
    <div className="space-y-4">
      <ErrorMessage>{error}</ErrorMessage>

      {can('kyc.case.assign') ? (
        <div className="space-y-2 border-b border-slate-100 pb-4">
          <Field label="Assign to">
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee">
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.roles.join('/')})
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="secondary" disabled={pending} onClick={() => run(`/api/kyc/cases/${caseId}/assign`, { assigneeId: assignee })}>
            Assign case
          </Button>
        </div>
      ) : null}

      {can('kyc.case.review') && (status === 'ASSIGNED' || status === 'PENDING_INFO' || status === 'ESCALATED') ? (
        <Button variant="secondary" disabled={pending} onClick={() => run(`/api/kyc/cases/${caseId}/start-review`, { expectedVersion: version })}>
          Start review
        </Button>
      ) : null}

      <Field label="Reason / note" hint="At least 10 characters. Stored on the immutable audit trail.">
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain the action you are taking" />
      </Field>

      {can('kyc.case.review') ? (
        <div className="space-y-2">
          <Field label="Documents to request" hint="Comma separated">
            <Input value={documents} onChange={(e) => setDocuments(e.target.value)} />
          </Field>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              run(`/api/kyc/cases/${caseId}/request-info`, {
                reason,
                requestedDocuments: documents.split(',').map((d) => d.trim()).filter(Boolean),
                expectedVersion: version,
              })
            }
          >
            Request information
          </Button>
        </div>
      ) : null}

      {can('kyc.case.escalate') ? (
        <Button variant="secondary" disabled={pending} onClick={() => run(`/api/kyc/cases/${caseId}/escalate`, { reason, expectedVersion: version })}>
          Escalate
        </Button>
      ) : null}

      {can('kyc.case.decide') ? (
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
          {highRiskSelfDecision ? (
            <p className="text-xs text-amber-700">
              Four-eyes rule: this {riskLevel.toLowerCase()} risk case must be decided by someone other than its reviewer.
            </p>
          ) : null}
          <Button disabled={pending} onClick={() => run(`/api/kyc/cases/${caseId}/decision`, { decision: 'APPROVE', reason, expectedVersion: version })}>
            Approve case
          </Button>
          <Button variant="danger" disabled={pending} onClick={() => run(`/api/kyc/cases/${caseId}/decision`, { decision: 'REJECT', reason, expectedVersion: version })}>
            Reject case
          </Button>
        </div>
      ) : null}
    </div>
  );
}
