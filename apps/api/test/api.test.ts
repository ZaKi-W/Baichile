import { beforeAll, describe, expect, it } from 'vitest';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth.service';

describe('MVP API', () => {
  let app: NestFastifyApplication;
  let token: string;
  let visitorId: string;

  beforeAll(async () => {
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
    expect(response.body).not.toContain('openid');
    expect(response.body).not.toContain('session_key');
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
    const order = await app.inject({
      method: 'POST',
      url: '/v1/orders/virtual',
      headers: { authorization: `Bearer ${token}`, 'x-visitor-id': visitorId },
      payload,
    });
    expect(order.statusCode).toBe(201);
    expect(order.json().isVirtual).toBe(true);
    expect(order.json().totalCents).toBe(quote.json().totalCents);
    expect(order.json().route.label).toBe('虚拟配送路线');
    expect(order.json().route.destination).toEqual(payload.virtualDestinationPoint);
  });
});
