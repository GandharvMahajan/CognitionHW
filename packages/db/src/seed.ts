import argon2 from 'argon2';
import { riskFromScore, slaDueAt } from '@fintech/domain';
import {
  type FlagEnvironment,
  type KycStatus,
  type Prisma,
  type RefundStatus,
  type RiskLevel,
  type Role,
  prisma,
} from './index.js';

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'Password123!';

const DEMO_USERS: Array<{ email: string; name: string; roles: Role[] }> = [
  { email: 'admin@fintech.test', name: 'Ada Admin', roles: ['ADMIN'] },
  { email: 'approver@fintech.test', name: 'Alex Approver', roles: ['APPROVER'] },
  { email: 'approver2@fintech.test', name: 'Priya Approver', roles: ['APPROVER'] },
  { email: 'reviewer@fintech.test', name: 'Riley Reviewer', roles: ['REVIEWER'] },
  { email: 'reviewer2@fintech.test', name: 'Rio Reviewer', roles: ['REVIEWER'] },
  { email: 'auditor@fintech.test', name: 'Avery Auditor', roles: ['AUDITOR'] },
];

const COUNTRIES = ['US', 'GB', 'DE', 'SG', 'BR', 'IN', 'NG', 'AE'];
const DOC_TYPES = ['PASSPORT', 'PROOF_OF_ADDRESS', 'SELFIE', 'BANK_STATEMENT'];
const METHODS = ['visa_4242', 'mastercard_5100', 'ach_debit', 'sepa_debit'];

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600_000);
}

async function main(): Promise<void> {
  console.log('Seeding demo data...');

  // Order matters: audit events are immutable and cannot be deleted, so truncate with CASCADE.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "AuditEvent", "Notification", "Job", "Comment", "RefundAttempt", "Refund",
      "Transaction", "FlagChange", "FeatureFlag", "KycInfoRequest", "KycDocument", "KycCase",
      "Customer", "User" RESTART IDENTITY CASCADE;
  `);

  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  const users = await Promise.all(
    DEMO_USERS.map((u) => prisma.user.create({ data: { ...u, passwordHash } })),
  );
  const byEmail = (email: string) => {
    const user = users.find((u) => u.email === email);
    if (!user) throw new Error(`Seed user missing: ${email}`);
    return user;
  };
  const admin = byEmail('admin@fintech.test');
  const approver = byEmail('approver@fintech.test');
  const reviewer = byEmail('reviewer@fintech.test');
  const reviewer2 = byEmail('reviewer2@fintech.test');

  const auditRows: Prisma.AuditEventCreateManyInput[] = [];

  // ---------------------------------------------------------------- customers
  const customers = await Promise.all(
    Array.from({ length: 24 }, (_, i) => {
      const n = i + 1;
      return prisma.customer.create({
        data: {
          fullName: `Customer ${String(n).padStart(2, '0')}`,
          email: `customer${n}@example.com`,
          country: COUNTRIES[i % COUNTRIES.length],
          dateOfBirth: new Date(Date.UTC(1970 + (i % 30), i % 12, ((i * 7) % 27) + 1)),
          riskScore: (i * 13) % 100,
        },
      });
    }),
  );

  // ---------------------------------------------------------------- kyc cases
  const statuses: KycStatus[] = [
    'NEW',
    'NEW',
    'ASSIGNED',
    'IN_REVIEW',
    'PENDING_INFO',
    'ESCALATED',
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED',
  ];

  for (const [i, customer] of customers.entries()) {
    const status = statuses[i % statuses.length];
    const riskScore = customer.riskScore;
    const riskLevel = riskFromScore(riskScore) as RiskLevel;
    const createdAt = hoursAgo(96 - i * 3);
    const assigned = status !== 'NEW';
    const decided = status === 'APPROVED' || status === 'REJECTED';
    const kycCase = await prisma.kycCase.create({
      data: {
        reference: `KYC-${String(1000 + i)}`,
        customerId: customer.id,
        status,
        riskLevel,
        riskScore,
        assigneeId: assigned ? (i % 2 === 0 ? reviewer.id : reviewer2.id) : null,
        slaDueAt: slaDueAt(createdAt, riskLevel),
        createdAt,
        version: assigned ? 2 : 0,
        decidedById: decided ? approver.id : null,
        decidedAt: decided ? hoursAgo(2) : null,
        decisionReason: decided
          ? status === 'APPROVED'
            ? 'All documents verified against government registry'
            : 'Identity document failed authenticity checks'
          : null,
        documents: {
          create: DOC_TYPES.slice(0, 2 + (i % 3)).map((type) => ({
            type,
            fileName: `${type.toLowerCase()}-${customer.id.slice(-6)}.pdf`,
            status: decided ? 'ACCEPTED' : 'PENDING',
          })),
        },
      },
    });

    auditRows.push({
      action: 'kyc.case.assigned',
      entityType: 'KYC_CASE',
      entityId: kycCase.id,
      actorId: admin.id,
      summary: `Case ${kycCase.reference} seeded with status ${status}`,
      createdAt,
    });

    if (status === 'PENDING_INFO') {
      await prisma.kycInfoRequest.create({
        data: {
          caseId: kycCase.id,
          requestedDocuments: ['PROOF_OF_ADDRESS'],
          reason: 'Address document is older than 90 days, please upload a recent statement',
          requestedById: reviewer.id,
        },
      });
    }
  }

  // ------------------------------------------------------- transactions/refunds
  const refundStatuses: RefundStatus[] = [
    'REQUESTED',
    'PENDING_APPROVAL',
    'APPROVED',
    'PROCESSING',
    'SUCCEEDED',
    'FAILED',
    'RECONCILED',
    'REJECTED',
  ];

  let refundIndex = 0;
  for (const [i, customer] of customers.entries()) {
    const txnCount = 1 + (i % 3);
    for (let t = 0; t < txnCount; t++) {
      const amountMinor = 2_500 + ((i * 7 + t * 13) % 90) * 1_000;
      const txn = await prisma.transaction.create({
        data: {
          reference: `TXN-${String(5000 + i * 10 + t)}`,
          customerId: customer.id,
          amountMinor,
          paymentMethod: METHODS[(i + t) % METHODS.length],
          description: `Order #${9000 + i * 10 + t}`,
          createdAt: hoursAgo(240 - i * 5 - t),
          settled: true,
        },
      });

      if ((i + t) % 2 === 0) {
        const status = refundStatuses[refundIndex % refundStatuses.length];
        refundIndex++;
        const partial = refundIndex % 3 === 0;
        const refundAmount = partial ? Math.floor(amountMinor / 2) : amountMinor;
        const succeeded = status === 'SUCCEEDED' || status === 'RECONCILED';
        const refund = await prisma.refund.create({
          data: {
            reference: `RFD-${String(7000 + refundIndex)}`,
            transactionId: txn.id,
            customerId: customer.id,
            amountMinor: refundAmount,
            kind: partial ? 'PARTIAL' : 'FULL',
            status,
            reason: 'Customer reported an unauthorised or duplicate charge',
            idempotencyKey: `seed-${txn.id}-${refundIndex}`,
            requestedById: reviewer.id,
            approvedById: ['APPROVED', 'PROCESSING', 'SUCCEEDED', 'RECONCILED', 'REJECTED'].includes(
              status,
            )
              ? approver.id
              : null,
            decisionReason: status === 'REJECTED' ? 'Chargeback already filed with the network' : null,
            attempts: status === 'FAILED' ? 1 : succeeded ? 1 : 0,
            lastError: status === 'FAILED' ? 'PROVIDER_TIMEOUT: gateway did not respond' : null,
            providerReference: succeeded ? `prov_${txn.id.slice(-8)}` : null,
            executedAt: succeeded ? hoursAgo(6) : null,
            reconciledAt: status === 'RECONCILED' ? hoursAgo(3) : null,
            version: 2,
            createdAt: hoursAgo(48 - (refundIndex % 40)),
          },
        });

        if (status === 'FAILED') {
          await prisma.refundAttempt.create({
            data: {
              refundId: refund.id,
              attemptNumber: 1,
              succeeded: false,
              error: 'PROVIDER_TIMEOUT: gateway did not respond',
            },
          });
        }
        if (succeeded) {
          await prisma.refundAttempt.create({
            data: {
              refundId: refund.id,
              attemptNumber: 1,
              succeeded: true,
              providerReference: refund.providerReference,
            },
          });
        }

        auditRows.push({
          action: 'refund.requested',
          entityType: 'REFUND',
          entityId: refund.id,
          actorId: reviewer.id,
          summary: `Refund ${refund.reference} requested for ${refund.amountMinor} minor units`,
          createdAt: refund.createdAt,
        });
      }
    }
  }

  // --------------------------------------------------------------- feature flags
  const flagDefs = [
    ['checkout.new-risk-engine', 'checkout', 'Route checkout through the v2 risk engine'],
    ['checkout.apple-pay', 'checkout', 'Enable Apple Pay at checkout'],
    ['payments.instant-payouts', 'payments', 'Allow instant payouts for verified merchants'],
    ['payments.retry-backoff-v2', 'payments', 'Exponential backoff for payment retries'],
    ['kyc.auto-approve-low-risk', 'kyc', 'Auto-approve LOW risk cases with clean documents'],
    ['kyc.document-ocr', 'kyc', 'Run OCR extraction on uploaded documents'],
    ['refunds.partial-refunds', 'refunds', 'Allow partial refunds in the operator console'],
    ['console.dark-mode', 'console', 'Dark mode for the operations console'],
  ] as const;
  const environments: FlagEnvironment[] = ['development', 'staging', 'production'];

  for (const [idx, [key, service, description]] of flagDefs.entries()) {
    for (const [envIdx, environment] of environments.entries()) {
      const enabled = environment !== 'production' ? idx % 2 === 0 : idx % 3 === 0;
      const flag = await prisma.featureFlag.create({
        data: {
          key,
          service,
          environment,
          description,
          enabled,
          rolloutPercentage: enabled ? [100, 50, 25][(idx + envIdx) % 3] : 0,
          version: 1,
        },
      });
      auditRows.push({
        action: 'flag.created',
        entityType: 'FEATURE_FLAG',
        entityId: flag.id,
        actorId: admin.id,
        summary: `Flag ${key} created in ${environment}`,
      });
    }
  }

  // A production change awaiting a checker, so the demo has approval work queued up.
  const prodFlag = await prisma.featureFlag.findFirstOrThrow({
    where: { key: 'checkout.new-risk-engine', environment: 'production' },
  });
  const pendingChange = await prisma.flagChange.create({
    data: {
      flagId: prodFlag.id,
      kind: 'ROLLOUT',
      status: 'PENDING_APPROVAL',
      reason: 'Ramp the v2 risk engine to 25% of production traffic',
      beforeState: { enabled: prodFlag.enabled, rolloutPercentage: prodFlag.rolloutPercentage },
      afterState: { enabled: true, rolloutPercentage: 25 },
      expectedVersion: prodFlag.version,
      requestedById: reviewer.id,
    },
  });
  auditRows.push({
    action: 'flag.change_requested',
    entityType: 'FLAG_CHANGE',
    entityId: pendingChange.id,
    actorId: reviewer.id,
    summary: `Rollout change requested for ${prodFlag.key} in production`,
  });

  await prisma.auditEvent.createMany({ data: auditRows });

  await prisma.notification.create({
    data: {
      userId: approver.id,
      type: 'FLAG_CHANGE_PENDING',
      title: 'Production flag change awaiting approval',
      body: `${prodFlag.key} rollout to 25% needs a checker`,
      entityType: 'FLAG_CHANGE',
      entityId: pendingChange.id,
    },
  });

  const counts = {
    users: users.length,
    customers: customers.length,
    kycCases: await prisma.kycCase.count(),
    transactions: await prisma.transaction.count(),
    refunds: await prisma.refund.count(),
    featureFlags: await prisma.featureFlag.count(),
    auditEvents: await prisma.auditEvent.count(),
  };
  console.log('Seed complete', counts);
  console.log(`Demo password for every account: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
