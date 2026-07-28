import { type Role, riskFromScore, slaDueAt } from '@fintech/domain';
import type { Express } from 'express';
import request, { type Test } from 'supertest';
import { hashPassword } from '../auth/password.js';
import { createApp } from '../app.js';
import { prisma } from '../services/db.js';
import { paymentGateway } from '../services/payment-gateway.js';

export const TEST_PASSWORD = 'Password123!';

let cachedApp: Express | null = null;

export function app(): Express {
  cachedApp ??= createApp();
  return cachedApp;
}

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "AuditEvent", "Notification", "Job", "Comment", "RefundAttempt", "Refund",
      "Transaction", "FlagChange", "FeatureFlag", "KycInfoRequest", "KycDocument", "KycCase",
      "Customer", "User" RESTART IDENTITY CASCADE;
  `);
  paymentGateway.reset();
}

export interface TestUser {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  token: string;
}

let passwordHashCache: string | null = null;

export async function createUser(roles: Role[], overrides: Partial<{ email: string; name: string }> = {}) {
  passwordHashCache ??= await hashPassword(TEST_PASSWORD);
  const email = overrides.email ?? `${roles.join('-').toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@test.io`;
  const user = await prisma.user.create({
    data: {
      email,
      name: overrides.name ?? `${roles[0]} User`,
      roles,
      passwordHash: passwordHashCache,
    },
  });
  return user;
}

export async function login(email: string, password = TEST_PASSWORD): Promise<string> {
  const res = await request(app()).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${res.text}`);
  return res.body.token as string;
}

export async function actor(roles: Role[], overrides: Partial<{ email: string; name: string }> = {}): Promise<TestUser> {
  const user = await createUser(roles, overrides);
  const token = await login(user.email);
  return { id: user.id, email: user.email, name: user.name, roles: user.roles as Role[], token };
}

export function as(user: TestUser) {
  const agent = request(app());
  const withAuth = (t: Test) => t.set('Authorization', `Bearer ${user.token}`);
  return {
    get: (url: string) => withAuth(agent.get(url)),
    post: (url: string) => withAuth(agent.post(url)),
  };
}

export function anon() {
  const agent = request(app());
  return { get: (url: string) => agent.get(url), post: (url: string) => agent.post(url) };
}

export async function seedCustomer(overrides: Partial<{ riskScore: number; fullName: string }> = {}) {
  return prisma.customer.create({
    data: {
      fullName: overrides.fullName ?? `Case Customer ${Math.random().toString(36).slice(2, 7)}`,
      email: `cust-${Math.random().toString(36).slice(2, 10)}@example.com`,
      country: 'US',
      dateOfBirth: new Date('1990-05-05'),
      riskScore: overrides.riskScore ?? 10,
    },
  });
}

export async function seedKycCase(
  options: { riskScore?: number; status?: 'NEW' | 'ASSIGNED' | 'IN_REVIEW'; assigneeId?: string } = {},
) {
  const customer = await seedCustomer({ riskScore: options.riskScore ?? 10 });
  const riskLevel = riskFromScore(customer.riskScore);
  const createdAt = new Date();
  return prisma.kycCase.create({
    data: {
      reference: `KYC-T-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      customerId: customer.id,
      status: options.status ?? 'NEW',
      riskLevel,
      riskScore: customer.riskScore,
      assigneeId: options.assigneeId ?? null,
      slaDueAt: slaDueAt(createdAt, riskLevel),
      documents: {
        create: [
          { type: 'PASSPORT', fileName: 'passport.pdf' },
          { type: 'PROOF_OF_ADDRESS', fileName: 'address.pdf' },
        ],
      },
    },
    include: { documents: true, customer: true },
  });
}

export async function seedTransaction(amountMinor = 50_000, settled = true) {
  const customer = await seedCustomer();
  return prisma.transaction.create({
    data: {
      reference: `TXN-T-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      customerId: customer.id,
      amountMinor,
      settled,
      paymentMethod: 'visa_4242',
      description: 'Test order',
    },
  });
}

export async function seedFlag(
  overrides: Partial<{ environment: 'development' | 'staging' | 'production'; enabled: boolean; rolloutPercentage: number }> = {},
) {
  return prisma.featureFlag.create({
    data: {
      key: `test.flag-${Math.random().toString(36).slice(2, 8)}`,
      service: 'checkout',
      environment: overrides.environment ?? 'production',
      description: 'Test flag',
      enabled: overrides.enabled ?? false,
      rolloutPercentage: overrides.rolloutPercentage ?? 0,
    },
  });
}

export async function auditActions(entityId: string): Promise<string[]> {
  const events = await prisma.auditEvent.findMany({
    where: { entityId },
    orderBy: { createdAt: 'asc' },
    select: { action: true },
  });
  return events.map((e) => e.action);
}
