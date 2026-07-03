import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { createDatabaseOptions } from '../src/database/database.config';
import { seedCatalog } from '../src/database/catalog.seed-runner';

describe('admin API', () => {
  let app: NestFastifyApplication;
  let token: string;

  beforeAll(async () => {
    process.env.ADMIN_BOOTSTRAP_USERNAME = 'root_admin';
    process.env.ADMIN_BOOTSTRAP_PASSWORD = 'root-password-123';
    const database = new DataSource(createDatabaseOptions());
    await database.initialize();
    await database.runMigrations();
    await seedCatalog(database);
    await database.query('TRUNCATE admin_audit_logs, admin_sessions, admin_users CASCADE');
    await database.destroy();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    delete process.env.ADMIN_BOOTSTRAP_USERNAME;
    delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
    await app?.close();
  });

  it('rejects unauthenticated admin access', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/admin/dashboard' });
    expect(response.statusCode).toBe(401);
  });

  it('logs in the bootstrapped administrator', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { username: 'root_admin', password: 'root-password-123' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().admin.role).toBe('super_admin');
    token = response.json().accessToken;
  });

  it('returns dashboard and paginated stores', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const dashboard = await app.inject({ method: 'GET', url: '/v1/admin/dashboard', headers });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json()).toHaveProperty('wallet.totalBalanceCents');

    const stores = await app.inject({ method: 'GET', url: '/v1/admin/stores?page=1&pageSize=5', headers });
    expect(stores.statusCode).toBe(200);
    expect(stores.json()).toMatchObject({ page: 1, pageSize: 5 });
    expect(stores.json().items.length).toBeGreaterThan(0);
  });

  it('creates a support administrator and enforces RBAC', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const created = await app.inject({
      method: 'POST',
      url: '/v1/admin/admin-users',
      headers,
      payload: {
        username: 'support_1',
        displayName: '客服一号',
        password: 'support-password-123',
        role: 'support',
      },
    });
    expect(created.statusCode).toBe(201);

    const login = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { username: 'support_1', password: 'support-password-123' },
    });
    const supportHeaders = { authorization: `Bearer ${login.json().accessToken}` };
    const forbidden = await app.inject({
      method: 'POST',
      url: '/v1/admin/stores',
      headers: supportHeaders,
      payload: {},
    });
    expect(forbidden.statusCode).toBe(403);
  });
});
