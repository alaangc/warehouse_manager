import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AuthenticationGateway } from '../../../src/auth/auth-service.js';
import type { CreatedSession } from '../../../src/auth/session-store.js';
import type { Environment } from '../../../src/config/env.js';
import { HttpProblem } from '../../../src/http/problem-handler.js';
import { createServer } from '../../../src/server.js';

const principal = {
  id: randomUUID(),
  username: 'admin',
  displayName: 'Administrator',
  role: 'ADMINISTRATOR' as const,
  active: true,
};
const csrf = 'c'.repeat(43);
const resumedCsrf = 'r'.repeat(64);
const sessionId = 's'.repeat(43);

class FakeAuth implements AuthenticationGateway {
  sessions = new Set<string>();
  async login(username: string, password: string): Promise<CreatedSession> {
    if (username !== 'admin' || password !== 'correct-password')
      throw new HttpProblem(401, 'INVALID_CREDENTIALS', 'Authentication Required');
    this.sessions.add(sessionId);
    return { id: sessionId, csrfToken: csrf, principal };
  }
  async findSession(id: string) {
    return this.sessions.has(id)
      ? { id, csrfToken: resumedCsrf, csrfHash: resumedCsrf, principal }
      : null;
  }
  matchesCsrf(_hash: string, token: string) {
    return token === csrf || token === resumedCsrf;
  }
  async logout(id: string) {
    this.sessions.delete(id);
  }
}

const env: Environment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  SESSION_SECRET: 'x'.repeat(32),
  APP_ORIGIN: 'https://warehouse.test',
  BUSINESS_TIMEZONE: 'America/Hermosillo',
  BUSINESS_CURRENCY: 'MXN',
  PORT: 3000,
  LOG_LEVEL: 'fatal',
  DOCUMENT_STORAGE_PATH: '/tmp/warehouse-documents',
};
const fakeDatabase = { executeQuery: async () => ({ rows: [] }) } as never;

describe('foundation HTTP contract', () => {
  it('logs in, reads the session, enforces CSRF, and logs out', async () => {
    const auth = new FakeAuth();
    const app = createServer(env, { auth, database: fakeDatabase });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', env.APP_ORIGIN)
      .send({ username: 'admin', password: 'correct-password' });
    expect(login.status).toBe(200);
    expect(login.headers['x-csrf-token']).toBe(csrf);
    expect(login.headers['set-cookie']?.[0]).toContain('__Host-wm_session=');
    const cookie = login.headers['set-cookie']![0]!.split(';')[0]!;
    const restoredSession = await request(app).get('/api/v1/auth/session').set('Cookie', cookie);
    expect(restoredSession.status).toBe(200);
    expect(restoredSession.headers['x-csrf-token']).toBe(resumedCsrf);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/logout')
          .set('Origin', env.APP_ORIGIN)
          .set('Cookie', cookie)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/logout')
          .set('Origin', env.APP_ORIGIN)
          .set('Cookie', cookie)
          .set('X-CSRF-Token', restoredSession.headers['x-csrf-token'] as string)
      ).status,
    ).toBe(204);
  });

  it('returns safe Problem Details for cross-origin, validation, and authentication failures', async () => {
    const app = createServer(env, { auth: new FakeAuth(), database: fakeDatabase });
    const crossOrigin = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.test')
      .send({ username: 'admin', password: 'correct-password' });
    expect(crossOrigin.status).toBe(403);
    const invalid = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', env.APP_ORIGIN)
      .send({ username: '', password: 'short' });
    expect(invalid.status).toBe(422);
    expect(invalid.type).toBe('application/problem+json');
    expect(JSON.stringify(invalid.body)).not.toMatch(/stack|postgres|password_hash/i);
    const missing = await request(app).get('/api/v1/auth/session');
    expect(missing.status).toBe(401);
    expect(missing.body).toMatchObject({ status: 401, code: 'AUTHENTICATION_REQUIRED' });
  });
});
