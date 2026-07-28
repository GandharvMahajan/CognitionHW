'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorMessage, StatusBadge, Table, Td } from '@fintech/ui';
import { submitCommand } from '@/lib/command';
import { formatDateTime } from '@/lib/format';

interface DocumentRow {
  id: string;
  type: string;
  fileName: string;
  status: string;
  reviewNote: string | null;
  reviewedAt: string | null;
}

export function DocumentReview({ caseId, documents, canReview }: { caseId: string; documents: DocumentRow[]; canReview: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function review(documentId: string, verdict: 'ACCEPTED' | 'REJECTED') {
    setPending(documentId);
    setError(null);
    const result = await submitCommand(`/api/kyc/cases/${caseId}/documents/${documentId}/review`, { verdict });
    setPending(null);
    if (!result.ok) {
      setError(`${result.errorCode}: ${result.errorMessage}`);
      return;
    }
    router.refresh();
  }

  if (documents.length === 0) return <p className="text-sm text-slate-500">No documents uploaded.</p>;

  return (
    <div className="space-y-3">
      <ErrorMessage>{error}</ErrorMessage>
      <Table headers={['Document', 'File', 'Status', 'Reviewed', '']}>
        {documents.map((doc) => (
          <tr key={doc.id}>
            <Td>{doc.type.replace(/_/g, ' ')}</Td>
            <Td className="text-xs text-slate-500">{doc.fileName}</Td>
            <Td>
              <StatusBadge value={doc.status === 'ACCEPTED' ? 'APPROVED' : doc.status === 'REJECTED' ? 'REJECTED' : 'NEW'} label={doc.status} />
            </Td>
            <Td className="text-xs text-slate-500">{doc.reviewedAt ? formatDateTime(doc.reviewedAt) : '—'}</Td>
            <Td>
              {canReview ? (
                <div className="flex gap-2">
                  <Button variant="secondary" disabled={pending === doc.id} onClick={() => review(doc.id, 'ACCEPTED')}>
                    Accept
                  </Button>
                  <Button variant="ghost" disabled={pending === doc.id} onClick={() => review(doc.id, 'REJECTED')}>
                    Reject
                  </Button>
                </div>
              ) : null}
            </Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
