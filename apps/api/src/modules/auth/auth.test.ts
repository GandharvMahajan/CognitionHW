import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../services/db.js';
import { TEST_PASSWORD, actor, anon, as, createUser, resetDatabase } from '../../test/helpers.js';

describe('auth', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('signs a user in and records an audit event', async () => {
    const user = await createUser(['REVIEWER'], { email: 'login@test.io', name: 'Login User' });
    const res = await anon().post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'login@test.io', roles: ['REVIEWER'] });
    expect(res.body.user.permissions).toContain('kyc.case.review');
    expect(res.body.user.permissions).not.toContain('kyc.case.decide');
    expect(res.headers['set-cookie']?.[0]).toMatch(/fintech_session=.*HttpOnly/);

    const events = await prisma.auditEvent.findMany({ where: { entityId: user.id } });
    expect(events.map((e) => e.action)).toContain('auth.login');
  });

  it('rejects a wrong password without leaking which part failed', async () => {
    const user = await createUser(['REVIEWER']);
    const res = await anon().post('/api/auth/login').send({ email: user.email, password: 'Wrong-Password-1' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('rejects unknown accounts and deactivated users', async () => {
    const unknown = await anon().post('/api/auth/login').send({ email: 'nobody@test.io', password: TEST_PASSWORD });
    expect(unknown.status).toBe(401);

    const user = await createUser(['ADMIN']);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    const disabled = await anon().post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
    expect(disabled.status).toBe(401);
  });

  it('validates the login payload', async () => {
    const res = await anon().post('/api/auth/login').send({ email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires authentication on protected routes', async () => {
    const res = await anon().get('/api/kyc/cases');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the current principal with resolved permissions', async () => {
    const admin = await actor(['ADMIN']);
    const res = await as(admin).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.permissions).toEqual(expect.arrayContaining(['flag.killswitch', 'refund.reconcile']));
  });

  it('rejects a tampered token', async () => {
    const admin = await actor(['ADMIN']);
    const res = await anon().get('/api/auth/me').set('Authorization', `Bearer ${admin.token}tampered`);
    expect(res.status).toBe(401);
  });

  it('logs out and audits the event', async () => {
    const reviewer = await actor(['REVIEWER']);
    const res = await as(reviewer).post('/api/auth/logout');
    expect(res.status).toBe(204);
    const events = await prisma.auditEvent.findMany({ where: { entityId: reviewer.id } });
    expect(events.map((e) => e.action)).toContain('auth.logout');
  });
});
