import { beforeAll, describe, expect, it } from 'vitest';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth.service';
import { DataSource } from 'typeorm';
import { createDatabaseOptions } from '../src/database/database.config';
import { seedCatalog } from '../src/database/catalog.seed-runner';

describe('MVP API', () => {
  let app: NestFastifyApplication;
  let token: string;
  let visitorId: string;
  let accountId: string;
  let accountToken: string;
  let guestAddressId: string;

  beforeAll(async () => {
    const database = new DataSource(createDatabaseOptions());
    await database.initialize();
    await database.runMigrations();
    await seedCatalog(database);
    await database.destroy();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it('creates a guest session', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/auth/guest' });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.visitorId).toMatch(/^visitor_/);
    token = body.accessToken;
    visitorId = body.visitorId;
  });

  it('stores an address for the current guest only', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/addresses',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: '游客', phone: '13800000000', address: '上海市测试路1号',
        detail: '101室', tag: '家', lat: 31.2, lng: 121.5, isDefault: true,
      },
    });
    expect(response.statusCode).toBe(201);
    guestAddressId = response.json().id;

    const anonymous = await app.inject({ method: 'GET', url: '/v1/addresses/me' });
    expect(anonymous.json()).toEqual([]);

    const mine = await app.inject({
      method: 'GET',
      url: '/v1/addresses/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(mine.json().map((item: { id: string }) => item.id)).toContain(guestAddressId);
  });

  it('accepts an account token created before database persistence', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/addresses',
      headers: { authorization: 'Bearer account.legacy-account' },
      payload: {
        name: '旧用户', phone: '13800000001', address: '上海市测试路2号',
        detail: '202室', tag: '家', lat: 31.2, lng: 121.5, isDefault: true,
      },
    });

    expect(response.statusCode).toBe(201);
  });

  it('creates a safe development account session when WeChat credentials are absent', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/wechat-mini',
      payload: {
        code: 'wx-code',
        visitorId,
        profile: {
          avatarUrl: 'https://example.com/avatar.png',
          nickname: '小白',
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      accountId: expect.stringMatching(/^account_/),
      accessToken: expect.stringMatching(/^account\./),
      provider: 'dev-mock',
      profile: {
        avatarUrl: 'https://example.com/avatar.png',
        nickname: '小白',
      },
    });
    accountId = response.json().accountId;
    accountToken = response.json().accessToken;
    const addresses = await app.inject({
      method: 'GET',
      url: '/v1/addresses/me',
      headers: { authorization: `Bearer ${accountToken}` },
    });
    expect(addresses.json().map((item: { id: string }) => item.id)).toContain(guestAddressId);
    expect(response.body).not.toContain('openid');
    expect(response.body).not.toContain('session_key');
  });

  it('initializes an account wallet and supports daily check-in and test credits', async () => {
    const initial = await app.inject({
      method: 'GET',
      url: '/v1/accounts/me/wallet',
      headers: { authorization: `Bearer ${accountToken}` },
    });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual({ balanceCents: 30_000, checkedInToday: false });

    const checkIn = await app.inject({
      method: 'POST',
      url: '/v1/accounts/me/check-in',
      headers: { authorization: `Bearer ${accountToken}` },
    });
    expect(checkIn.statusCode).toBe(201);
    expect(checkIn.json()).toEqual({ balanceCents: 40_000, checkedInToday: true });

    const duplicate = await app.inject({
      method: 'POST',
      url: '/v1/accounts/me/check-in',
      headers: { authorization: `Bearer ${accountToken}` },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe('ALREADY_CHECKED_IN');

    const credit = await app.inject({
      method: 'POST',
      url: '/v1/accounts/me/test-credit',
      headers: { authorization: `Bearer ${accountToken}` },
    });
    expect(credit.statusCode).toBe(201);
    expect(credit.json()).toEqual({ balanceCents: 140_000, checkedInToday: true });

    const transactions = await app.inject({
      method: 'GET',
      url: '/v1/accounts/me/wallet/transactions',
      headers: { authorization: `Bearer ${accountToken}` },
    });
    expect(transactions.statusCode).toBe(200);
    expect(transactions.json().map((item: { type: string }) => item.type)).toEqual([
      'test_credit',
      'daily_checkin',
      'initial_grant',
    ]);
  });

  it('rejects wallet access and order creation for guests', async () => {
    const wallet = await app.inject({
      method: 'GET',
      url: '/v1/accounts/me/wallet',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(wallet.statusCode).toBe(401);
    expect(wallet.json().code).toBe('UNAUTHORIZED');
  });

  it('rejects missing WeChat credentials in production', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAppId = process.env.WECHAT_MINI_APP_ID;
    const previousSecret = process.env.WECHAT_MINI_APP_SECRET;
    process.env.NODE_ENV = 'production';
    delete process.env.WECHAT_MINI_APP_ID;
    delete process.env.WECHAT_MINI_APP_SECRET;

    try {
      await expect(new AuthService().loginWechatMini({
        code: 'wx-code',
        profile: { avatarUrl: 'https://example.com/avatar.png', nickname: '小白' },
      })).rejects.toThrow('微信登录配置缺失');
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousAppId === undefined) delete process.env.WECHAT_MINI_APP_ID;
      else process.env.WECHAT_MINI_APP_ID = previousAppId;
      if (previousSecret === undefined) delete process.env.WECHAT_MINI_APP_SECRET;
      else process.env.WECHAT_MINI_APP_SECRET = previousSecret;
    }
  });

  it('returns public home catalog', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/catalog/home' });
    expect(response.statusCode).toBe(200);
    expect(response.json().stores.length).toBeGreaterThanOrEqual(12);
  });

  it('persists analytics events', async () => {
    const eventName = `home_view_${Date.now()}`;
    const response = await app.inject({
      method: 'POST',
      url: '/v1/analytics/events',
      headers: { authorization: `Bearer ${token}` },
      payload: { eventName, payload: { source: 'launch' } },
    });
    expect(response.statusCode).toBe(201);

    const database = new DataSource(createDatabaseOptions());
    await database.initialize();
    const rows = await database.query(
      'SELECT event_name FROM analytics_events WHERE event_name = $1',
      [eventName],
    );
    await database.destroy();
    expect(rows).toHaveLength(1);
  });

  it('quotes and creates a virtual order', async () => {
    const store = (await app.inject({ method: 'GET', url: '/v1/catalog/stores/store-01' })).json();
    const payload = {
      storeId: store.id,
      virtualDestinationId: 'desk',
      virtualDestinationPoint: { lat: 31.2401, lng: 121.4902, coordSystem: 'gcj02' },
      lines: [{ menuItemId: store.menu[0].id, optionIds: [store.menu[0].specGroups[0].options[0].id], quantity: 2 }],
    };
    const quote = await app.inject({ method: 'POST', url: '/v1/orders/quote', payload });
    expect(quote.statusCode).toBe(201);
    expect(quote.json().itemsTotalCaloriesKcal).toBeGreaterThan(0);
    expect(quote.json().lines[0].totalCaloriesKcal).toBe(
      quote.json().lines[0].unitCaloriesKcal * 2,
    );
    const guestOrder = await app.inject({
      method: 'POST',
      url: '/v1/orders/virtual',
      headers: { authorization: `Bearer ${token}`, 'x-visitor-id': visitorId },
      payload,
    });
    expect(guestOrder.statusCode).toBe(401);
    expect(guestOrder.json().code).toBe('UNAUTHORIZED');

    const accountOrder = await app.inject({
      method: 'POST',
      url: '/v1/orders/virtual',
      headers: {
        authorization: `Bearer ${accountToken}`,
      },
      payload,
    });
    expect(accountOrder.statusCode).toBe(201);
    expect(accountOrder.json().accountId).toBe(accountId);
    expect(accountOrder.json().isVirtual).toBe(true);
    expect(accountOrder.json().totalCents).toBe(quote.json().totalCents);
    expect(accountOrder.json().itemsTotalCaloriesKcal).toBe(quote.json().itemsTotalCaloriesKcal);
    expect(accountOrder.json().durationMs).toBe(store.virtualDeliveryMinutes * 60_000);
    expect(accountOrder.json().route.label).toBe('虚拟配送路线');
    expect(accountOrder.json().route.destination).toEqual(payload.virtualDestinationPoint);

    const walletAfterOrder = await app.inject({
      method: 'GET',
      url: '/v1/accounts/me/wallet',
      headers: { authorization: `Bearer ${accountToken}` },
    });
    expect(walletAfterOrder.json().balanceCents).toBe(140_000 - accountOrder.json().totalCents);

    const anonymousList = await app.inject({ method: 'GET', url: '/v1/orders/me' });
    expect(anonymousList.json()).toEqual([]);

    const spoofedList = await app.inject({
      method: 'GET',
      url: '/v1/orders/me',
      headers: { 'x-account-id': accountId },
    });
    expect(spoofedList.json()).toEqual([]);

    const accountList = await app.inject({
      method: 'GET',
      url: '/v1/orders/me',
      headers: { authorization: `Bearer ${accountToken}` },
    });
    expect(accountList.json().map((item: { id: string }) => item.id)).toContain(accountOrder.json().id);

    const pendingSavings = await app.inject({
      method: 'GET',
      url: '/v1/accounts/me/savings',
      headers: { authorization: `Bearer ${accountToken}` },
    });
    expect(pendingSavings.json()).toEqual({
      savedMoneyCents: 0,
      savedCaloriesKcal: 0,
      completedOrderCount: 0,
    });

    const database = new DataSource(createDatabaseOptions());
    await database.initialize();
    await database.query(
      `UPDATE virtual_orders
       SET started_at = now() - ((duration_ms + 84000) * interval '1 millisecond')
       WHERE id = $1`,
      [accountOrder.json().id],
    );
    await database.destroy();

    const completedSavings = await app.inject({
      method: 'GET',
      url: '/v1/accounts/me/savings',
      headers: { authorization: `Bearer ${accountToken}` },
    });
    expect(completedSavings.json()).toEqual({
      savedMoneyCents: accountOrder.json().totalCents,
      savedCaloriesKcal: accountOrder.json().itemsTotalCaloriesKcal,
      completedOrderCount: 1,
    });

    const beforeInsufficient = await app.inject({
      method: 'GET',
      url: '/v1/orders/me',
      headers: { authorization: `Bearer ${accountToken}` },
    });
    const balanceDatabase = new DataSource(createDatabaseOptions());
    await balanceDatabase.initialize();
    await balanceDatabase.query('UPDATE accounts SET balance_cents = 0 WHERE id = $1', [accountId]);
    await balanceDatabase.destroy();

    const insufficient = await app.inject({
      method: 'POST',
      url: '/v1/orders/virtual',
      headers: { authorization: `Bearer ${accountToken}` },
      payload,
    });
    expect(insufficient.statusCode).toBe(409);
    expect(insufficient.json().code).toBe('INSUFFICIENT_BALANCE');

    const afterInsufficient = await app.inject({
      method: 'GET',
      url: '/v1/orders/me',
      headers: { authorization: `Bearer ${accountToken}` },
    });
    expect(afterInsufficient.json()).toHaveLength(beforeInsufficient.json().length);
  });

  it('keeps account data after the application restarts', async () => {
    await app.close();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const addresses = await app.inject({
      method: 'GET',
      url: '/v1/addresses/me',
      headers: { authorization: `Bearer ${accountToken}` },
    });
    expect(addresses.json().map((item: { id: string }) => item.id)).toContain(guestAddressId);
  });
});
