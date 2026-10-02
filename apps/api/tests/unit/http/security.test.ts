import express from 'express';
import supertest from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { loadEnvironment } from '../../../src/config/env.js';
import { configureSecurity, requestLimiter } from '../../../src/http/security.js';
import { problemHandler } from '../../../src/http/problem-handler.js';
import {
  createAuthRouter,
  sessionMiddleware,
  csrfProtection,
} from '../../../src/auth/auth-routes.js';
import type { AuthenticationGateway } from '../../../src/auth/auth-service.js';

const environment = loadEnvironment({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://test:test@localhost/test',
  SESSION_SECRET: 'Q7m4W9x2A8c6K3t5R1v0B4n8L6s9D2f5',
  APP_ORIGIN: 'https://warehouse.example.test',
  BUSINESS_TIMEZONE: 'America/Hermosillo',
  BUSINESS_CURRENCY: 'MXN',
  DOCUMENT_STORAGE_PATH: '/tmp/security-tests',
});

function application(trust?: string) {
  const app = express();
  configureSecurity(app, { ...environment, TRUST_PROXY: trust });
  app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/v1/probe', (req, res) => res.json({ ip: req.ip }));
  app.use(problemHandler);
  return app;
}

describe('production HTTP security', () => {
  it('caps login traffic even when usernames rotate, before body parsing', async () => {
    const app = express();
    configureSecurity(app, { ...environment, NODE_ENV: 'test' });
    app.post('/api/v1/auth/login', (_req, res) => res.sendStatus(204));
    app.use(problemHandler);
    for (let index = 0; index < 31; index++) {
      const response = await supertest(app)
        .post('/api/v1/auth/login')
        .send({ username: `user-${index}` });
      expect(response.status).toBe(index < 30 ? 204 : 429);
      if (index === 30) expect(response.body.code).toBe('RATE_LIMIT_EXCEEDED');
    }
  });

  it('keeps local HTTP development free of HSTS and automatic HTTPS upgrades', async () => {
    const app = express();
    configureSecurity(app, { ...environment, NODE_ENV: 'development' });
    app.get('/', (_req, res) => res.sendStatus(204));
    const response = await supertest(app).get('/');
    expect(response.status).toBe(204);
    expect(response.headers['strict-transport-security']).toBeUndefined();
    expect(response.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
  });

  it('rejects plaintext and ignores HTTPS headers from untrusted peers', async () => {
    for (const trust of [undefined, '192.0.2.1']) {
      const response = await supertest(application(trust))
        .get('/api/v1/probe')
        .set('X-Forwarded-Proto', 'https');
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('HTTPS_REQUIRED');
      expect(response.headers['permissions-policy']).toContain('bluetooth=(self)');
    }
    expect((await supertest(application()).get('/api/v1/health')).status).toBe(200);
  });

  it('trusts only configured proxy addresses and sends explicit security headers', async () => {
    const response = await supertest(application('127.0.0.1/32,::1/128'))
      .get('/api/v1/probe')
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-For', '198.51.100.7');
    expect(response.status).toBe(200);
    expect(response.body.ip).toBe('198.51.100.7');
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('limits requests using the socket IP instead of forged forwarded headers', async () => {
    const app = express();
    app.use(requestLimiter(2));
    app.get('/', (_req, res) => res.json({ ok: true }));
    app.use(problemHandler);
    for (let index = 0; index < 3; index++) {
      const response = await supertest(app).get('/').set('X-Forwarded-For', `198.51.100.${index}`);
      expect(response.status).toBe(index < 2 ? 200 : 429);
      if (index === 2) {
        expect(response.type).toBe('application/problem+json');
        expect(response.body.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(response.headers['retry-after']).toBeDefined();
      }
    }
  });

  it('sets and clears host-only production cookies and throttles normalized login names', async () => {
    const principal = {
      id: 'user',
      username: 'admin',
      displayName: 'Admin',
      role: 'ADMINISTRATOR' as const,
      active: true,
    };
    const auth: AuthenticationGateway = {
      login: vi.fn(async () => ({ id: 'session', csrfToken: 'csrf', principal })),
      findSession: vi.fn(async () => ({
        id: 'session',
        csrfToken: 'csrf',
        csrfHash: 'csrf',
        principal,
      })),
      matchesCsrf: () => true,
      logout: vi.fn(async () => {}),
    };
    const app = express();
    configureSecurity(app, { ...environment, TRUST_PROXY: '127.0.0.1/32,::1/128' });
    app.use(express.json());
    app.use(
      '/api/v1',
      sessionMiddleware(auth, environment),
      csrfProtection(auth),
      createAuthRouter(auth, environment),
    );
    app.use(problemHandler);
    for (let index = 0; index < 11; index++) {
      const response = await supertest(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-Proto', 'https')
        .send({ username: index % 2 ? ' admin ' : 'admin', password: 'password123' });
      expect(response.status).toBe(index < 10 ? 200 : 429);
      if (index === 0) {
        const cookie = String(response.headers['set-cookie']);
        for (const value of [
          '__Host-wm_session=',
          'HttpOnly',
          'Secure',
          'SameSite=Strict',
          'Path=/',
        ])
          expect(cookie).toContain(value);
        expect(cookie).not.toContain('Domain=');
      }
      if (index === 10) expect(response.type).toBe('application/problem+json');
    }
    expect(auth.login).toHaveBeenCalledTimes(10);
    const logout = await supertest(app)
      .post('/api/v1/auth/logout')
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', '__Host-wm_session=session')
      .set('X-CSRF-Token', 'csrf');
    expect(logout.status).toBe(204);
    expect(String(logout.headers['set-cookie'])).toContain('Secure');
    expect(String(logout.headers['set-cookie'])).toContain('HttpOnly');
  });
});
