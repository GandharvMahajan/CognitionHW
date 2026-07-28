'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorMessage, Input } from '@fintech/ui';
import { submitCommand } from '@/lib/command';

export function PendingChangeActions({ changeId, isMaker }: { changeId: string; isMaker: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function decide(decision: 'APPROVE' | 'REJECT') {
    setPending(true);
    setError(null);
    const result = await submitCommand(`/api/flags/changes/${changeId}/decision`, { decision, reason });
    setPending(false);
    if (!result.ok) {
      setError(`${result.errorCode}: ${result.errorMessage}`);
      return;
    }
    setReason('');
    router.refresh();
  }

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      {isMaker ? (
        <p className="text-xs text-amber-700">Maker-checker: you requested this change, so another approver must sign off.</p>
      ) : null}
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Decision reason (min 10 characters)"
        aria-label={`Decision reason for change ${changeId}`}
      />
      <ErrorMessage>{error}</ErrorMessage>
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => decide('APPROVE')}>
          Approve change
        </Button>
        <Button variant="danger" disabled={pending} onClick={() => decide('REJECT')}>
          Reject change
        </Button>
      </div>
    </div>
  );
}
