import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { createDatabaseOptions } from '../src/database/database.config';
import { seedCatalog } from '../src/database/catalog.seed-runner';
import { randomUUID } from 'node:crypto';

describe('admin API', () => {
  let app: NestFastifyApplication;
  let token: string;
  let categoryId: string;

  beforeAll(async () => {
    process.env.ADMIN_BOOTSTRAP_USERNAME = 'root_admin';
    process.env.ADMIN_BOOTSTRAP_PASSWORD = 'root-password-123';
    const database = new DataSource(createDatabaseOptions());
    await database.initialize();
    await database.runMigrations();
    await seedCatalog(database);
    categoryId = (await database.query('SELECT id FROM categories ORDER BY sort_order LIMIT 1'))[0].id;
    await database.query('TRUNCATE admin_audit_logs, admin_sessions, admin_users CASCADE');
    await database.query(`DELETE FROM menu_items WHERE id = 'admin-test-item'`);
    await database.query(`DELETE FROM virtual_orders WHERE store_id = 'admin-test-store'`);
    await database.query(`DELETE FROM stores WHERE id = 'admin-test-store'`);
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

  it('manages catalog, account currency, and order follow-up data', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const store = await app.inject({
      method: 'POST',
      url: '/v1/admin/stores',
      headers,
      payload: {
        id: 'admin-test-store',
        categoryId,
        name: '后台测试商家',
        description: '用于后台接口定向测试',
        coverUrl: null,
        tags: ['测试'],
        deliveryFeeCents: 100,
        packingFeeCents: 100,
        minimumOrderCents: 0,
        virtualDeliveryMinutes: 20,
        monthlySales: 0,
        distanceKm: 1,
        rating: 5,
        recentViewers: 0,
        systemHeat: 0,
        sourceType: 'original',
        sortOrder: 999,
        status: 'active',
      },
    });
    expect(store.statusCode).toBe(201);

    const menuItem = await app.inject({
      method: 'POST',
      url: '/v1/admin/menu-items',
      headers,
      payload: {
        id: 'admin-test-item',
        storeId: 'admin-test-store',
        categoryId,
        subCategoryId: null,
        name: '后台测试菜品',
        subtitle: null,
        imageUrl: null,
        basePriceCents: 1000,
        caloriesKcal: 100,
        calorieSource: { type: 'composition_estimate' },
        monthlySales: 0,
        specGroups: [],
        sourceType: 'original',
        sortOrder: 0,
        status: 'active',
      },
    });
    expect(menuItem.statusCode).toBe(201);

    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/wechat-mini',
      payload: {
        code: 'admin-api-user',
        profile: { nickname: '后台用户', avatarUrl: 'https://example.com/user.png' },
      },
    });
    const accountId = login.json().accountId as string;
    const account = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/accounts/${accountId}`,
      headers,
      payload: { nickname: '已编辑用户', status: 'active' },
    });
    expect(account.statusCode).toBe(200);
    expect(account.json().nickname).toBe('已编辑用户');

    const wallet = await app.inject({
      method: 'POST',
      url: `/v1/admin/accounts/${accountId}/wallet/adjustments`,
      headers,
      payload: { amountCents: 500, reason: '测试补偿' },
    });
    expect(wallet.statusCode).toBe(201);
    expect(wallet.json().transaction.type).toBe('admin_adjustment');

    const orderId = randomUUID();
    await app.get(DataSource).query(
      `INSERT INTO virtual_orders (
        id, account_id, status, store_id, destination_id, started_at, duration_ms,
        seed, items_total_cents, delivery_fee_cents, packing_fee_cents, total_cents,
        items_total_calories_kcal, lines, route
      ) VALUES ($1, $2, 'created', $3, 'test-destination', now(), 60000,
        'seed', 1000, 100, 100, 1200, 100, '[]'::jsonb, '{}'::jsonb)`,
      [orderId, accountId, 'admin-test-store'],
    );
    const order = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/orders/${orderId}`,
      headers,
      payload: { adminStatus: 'resolved', adminNote: '测试已处理' },
    });
    expect(order.statusCode).toBe(200);
    expect(order.json()).toMatchObject({ adminStatus: 'resolved', adminNote: '测试已处理' });
  });
});
