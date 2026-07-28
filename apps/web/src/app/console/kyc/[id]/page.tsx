import Link from 'next/link';
import { Card, PageHeader, StatusBadge } from '@fintech/ui';
import { apiGet } from '@/lib/api';
import { formatDateTime, relativeTime } from '@/lib/format';
import { requireSession } from '@/lib/session';
import { AuditTrail } from '@/components/audit-trail';
import { CommentThread } from '@/components/comment-thread';
import { CaseActions } from './case-actions';
import { DocumentReview } from './document-review';

interface CaseDetail {
  id: string;
  reference: string;
  status: string;
  riskLevel: string;
  riskScore: number;
  version: number;
  slaDueAt: string;
  slaState: string;
  createdAt: string;
  decisionReason: string | null;
  decidedAt: string | null;
  customer: { id: string; fullName: string; email: string; country: string; dateOfBirth: string; riskScore: number };
  assignee: { id: string; name: string } | null;
  decidedBy: { id: string; name: string } | null;
  documents: Array<{ id: string; type: string; fileName: string; status: string; reviewNote: string | null; reviewedAt: string | null }>;
  infoRequests: Array<{ id: string; reason: string; requestedDocuments: string[]; createdAt: string }>;
  comments: Array<{ id: string; body: string; createdAt: string; author: { name: string } }>;
  auditTrail: Array<{ id: string; action: string; summary: string; createdAt: string; actor: { name: string } | null }>;
  customerCaseCount: number;
}

export default async function KycCasePage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const kycCase = await apiGet<CaseDetail>(`/api/kyc/cases/${params.id}`);
  const users = await apiGet<{ users: Array<{ id: string; name: string; roles: string[] }> }>('/api/auth/users');

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Case ${kycCase.reference}`}
        description={`${kycCase.customer.fullName} · ${kycCase.customer.country}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge value={kycCase.status} />
            <StatusBadge value={kycCase.riskLevel} label={`Risk ${kycCase.riskScore}`} />
            <StatusBadge value={kycCase.slaState} />
            <Link href="/console/kyc" className="text-sm text-blue-600 hover:underline">
              Back to queue
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Customer">
            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-slate-500">Full name</dt>
                <dd className="font-medium">{kycCase.customer.fullName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd className="font-medium">{kycCase.customer.email}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Date of birth</dt>
                <dd className="font-medium">{formatDateTime(kycCase.customer.dateOfBirth)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Cases for this customer</dt>
                <dd className="font-medium">{kycCase.customerCaseCount}</dd>
              </div>
              <div>
                <dt className="text-slate-500">SLA due</dt>
                <dd className="font-medium">
                  {formatDateTime(kycCase.slaDueAt)} <span className="text-slate-400">({relativeTime(kycCase.slaDueAt)})</span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Assignee</dt>
                <dd className="font-medium">{kycCase.assignee?.name ?? 'Unassigned'}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Documents">
            <DocumentReview
              caseId={kycCase.id}
              documents={kycCase.documents}
              canReview={user.permissions.includes('kyc.case.review')}
            />
          </Card>

          {kycCase.infoRequests.length > 0 ? (
            <Card title="Information requests">
              <ul className="space-y-3 text-sm">
                {kycCase.infoRequests.map((request) => (
                  <li key={request.id} className="rounded-md border border-slate-200 p-3">
                    <p className="text-slate-700">{request.reason}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Requested: {request.requestedDocuments.join(', ')} · {formatDateTime(request.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="Comments">
            <CommentThread
              endpoint={`/api/kyc/cases/${kycCase.id}/comments`}
              comments={kycCase.comments}
              canComment={user.permissions.includes('kyc.comment.create')}
            />
          </Card>

          <Card title="Audit history">
            <AuditTrail events={kycCase.auditTrail} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Actions">
            <CaseActions
              caseId={kycCase.id}
              status={kycCase.status}
              version={kycCase.version}
              assigneeId={kycCase.assignee?.id ?? null}
              users={users.users}
              permissions={user.permissions}
              currentUserId={user.id}
              riskLevel={kycCase.riskLevel}
            />
          </Card>

          {kycCase.decisionReason ? (
            <Card title="Decision">
              <p className="text-sm text-slate-700">{kycCase.decisionReason}</p>
              <p className="mt-2 text-xs text-slate-500">
                {kycCase.decidedBy?.name} · {kycCase.decidedAt ? formatDateTime(kycCase.decidedAt) : ''}
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
