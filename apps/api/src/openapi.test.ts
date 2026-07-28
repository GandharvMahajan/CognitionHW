import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './test/helpers.js';

describe('api documentation', () => {
  it('serves an OpenAPI document covering every module', async () => {
    const res = await request(app()).get('/api/openapi.json');
    expect(res.status).toBe(200);
    const paths = Object.keys(res.body.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/auth/login',
        '/api/kyc/cases/{id}/decision',
        '/api/refunds/{id}/decision',
        '/api/flags/{id}/kill-switch',
        '/api/audit',
      ]),
    );
    expect(res.body.components.securitySchemes).toHaveProperty('cookieAuth');
  });

  it('exposes a health endpoint', async () => {
    const res = await request(app()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
