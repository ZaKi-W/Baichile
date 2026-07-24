import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateAdminPassword } from './admin-security';
import { AdminAuthService } from './admin-services';
import { collections } from './collections';
import { MemoryDatabase } from './database';
import type { AccountDoc, AdminSessionDoc } from './models';
import { BaichileRouter } from './router';
import { BaichileCloudServices } from './services';
import { PersistentRateLimiter } from './rate-limit';
import { validateAvatarUpload } from './storage';

describe('identity security', () => {
  it('does not accept constructed account bearer tokens', async () => {
    const db = new MemoryDatabase();
    const services = new BaichileCloudServices(db);

    expect(await services.auth.resolvePersistedIdentity('Bearer account.attacker')).toEqual({});
    expect(await db.collection<AccountDoc>(collections.accounts).count()).toBe(0);
  });

  it('requires a persisted guest session', async () => {
    const db = new MemoryDatabase();
    const services = new BaichileCloudServices(db);
    const guest = await services.auth.createGuest();

    await expect(services.auth.resolvePersistedIdentity(guest.accessToken)).resolves.toEqual({ visitorId: guest.visitorId });
    await expect(services.auth.resolvePersistedIdentity('guest.00000000-0000-4000-8000-000000000000')).resolves.toEqual({});
  });

  it('binds an existing legacy account to the current WeChat identity during login', async () => {
    const db = new MemoryDatabase();
    const services = new BaichileCloudServices(db);
    const openId = 'wechat-openid';
    const digest = createHash('sha256').update(openId).digest('hex');
    const accountId = `account_${digest.slice(0, 24)}`;
    await db.collection<AccountDoc>(collections.accounts).insert({
      _id: accountId,
      id: accountId,
      wechatOpenIdHash: null,
      nickname: '旧用户',
      avatarUrl: null,
      balanceCents: 0,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await services.auth.loginWechatMini({
      code: 'wx-login-code',
      profile: { avatarUrl: 'https://example.com/avatar.png', nickname: '小白' },
    }, openId);

    await expect(services.auth.resolvePersistedIdentity('', openId)).resolves.toEqual({ accountId });
    await expect(db.collection<AccountDoc>(collections.accounts).get(accountId))
      .resolves.toMatchObject({ wechatOpenIdHash: digest, nickname: '小白' });
  });

  it('ignores client supplied x-wx-openid headers', async () => {
    const router = new BaichileRouter(new MemoryDatabase());
    const result = await router.handle({
      method: 'POST', path: '/v1/auth/wechat-mini',
      headers: { 'x-wx-openid': 'forged-openid' },
      data: { code: 'forged', profile: { avatarUrl: 'https://example.com/a.png', nickname: '攻击者' } },
    });

    expect(result).toMatchObject({ ok: false, status: 401, code: 'WECHAT_CONTEXT_REQUIRED' });
  });

  it('allows WeChat login when a stale visitor id has no valid guest token', async () => {
    const db = new MemoryDatabase();
    const router = new BaichileRouter(db);
    const staleVisitorId = 'visitor_00000000-0000-4000-8000-000000000000';

    const result = await router.handle({
      method: 'POST',
      path: '/v1/auth/wechat-mini',
      data: {
        code: 'wx-login-code',
        visitorId: staleVisitorId,
        profile: { avatarUrl: 'https://example.com/avatar.png', nickname: '小白' },
      },
    }, { OPENID: 'wechat-openid' });

    expect(result).toMatchObject({ ok: true, status: 200, data: { provider: 'wechat' } });
    await expect(db.collection(collections.visitorSessions).get(staleVisitorId)).resolves.toBeNull();
  });

  it('disables the unauthenticated visitor merge endpoint', async () => {
    const router = new BaichileRouter(new MemoryDatabase());
    const result = await router.handle({
      method: 'POST', path: '/v1/auth/merge-visitor',
      data: { visitorId: 'visitor_victim', accountId: 'account_attacker' },
    });

    expect(result).toMatchObject({ ok: false, status: 401, code: 'ENDPOINT_DISABLED' });
  });

  it('only creates a Web business session from a trusted verified phone context', async () => {
    const db = new MemoryDatabase();
    const services = new BaichileCloudServices(db);
    const guest = await services.auth.createGuest();
    const router = new BaichileRouter(db);

    const unverified = await router.handle({
      method: 'POST',
      path: '/v1/auth/web-phone/session',
      authorization: guest.accessToken,
    }, { WEB_UID: 'web-user-without-phone' });
    expect(unverified).toMatchObject({ ok: false, status: 401, code: 'WEB_PHONE_UNVERIFIED' });

    const verified = await router.handle({
      method: 'POST',
      path: '/v1/auth/web-phone/session',
      authorization: guest.accessToken,
    }, { WEB_UID: 'web-phone-user', WEB_PHONE_NUMBER: '+86 13800138000' });
    expect(verified).toMatchObject({
      ok: true,
      data: {
        provider: 'phone',
        profile: { nickname: '13800138000' },
      },
    });
    const accountId = verified.ok && 'data' in verified
      ? (verified.data as { accountId: string }).accountId
      : '';
    expect(await db.collection(collections.visitorSessions).get(guest.visitorId))
      .toMatchObject({ accountId });

    const restored = await router.handle({
      method: 'POST',
      path: '/v1/auth/web-phone/session',
    }, { WEB_UID: 'web-phone-user' });
    expect(restored).toMatchObject({
      ok: true,
      data: {
        accountId,
        provider: 'phone',
        profile: { nickname: '13800138000' },
      },
    });
  });

  it('prioritizes the WeChat OPENID over a mapped Web UID', async () => {
    const db = new MemoryDatabase();
    const services = new BaichileCloudServices(db);
    const wechat = await services.auth.loginWechatMini({
      code: 'wechat-code',
      profile: { avatarUrl: 'https://example.com/wechat.png', nickname: '微信用户' },
    }, 'wechat-openid');
    const phone = await services.auth.loginWebPhone('web-phone-uid', '13900139000');

    await expect(services.auth.resolvePersistedIdentity('', 'wechat-openid', 'web-phone-uid'))
      .resolves.toEqual({ accountId: wechat.accountId });
    expect(phone.accountId).not.toBe(wechat.accountId);
  });
});

describe('admin security', () => {
  it('isolates public and admin API surfaces', async () => {
    const publicRouter = new BaichileRouter(new MemoryDatabase(), 'public');
    const adminRouter = new BaichileRouter(new MemoryDatabase(), 'admin');

    await expect(publicRouter.handle({ method: 'POST', path: '/v1/admin/auth/login', data: {} }))
      .resolves.toMatchObject({ ok: false, status: 404 });
    await expect(adminRouter.handle({ method: 'GET', path: '/v1/catalog/home' }))
      .resolves.toMatchObject({ ok: false, status: 404 });
  });

  it('requires an allowlisted browser origin on the admin surface', async () => {
    const previous = process.env.ADMIN_ALLOWED_ORIGINS;
    process.env.ADMIN_ALLOWED_ORIGINS = 'https://admin.example.com';
    try {
      const router = new BaichileRouter(new MemoryDatabase(), 'admin');
      await expect(router.handle({
        method: 'POST', path: '/v1/admin/auth/login', headers: { origin: 'https://evil.example.com' }, data: {},
      })).resolves.toMatchObject({ ok: false, status: 403, code: 'ADMIN_ORIGIN_FORBIDDEN' });
    } finally {
      if (previous === undefined) delete process.env.ADMIN_ALLOWED_ORIGINS;
      else process.env.ADMIN_ALLOWED_ORIGINS = previous;
    }
  });

  it('does not create a default admin when bootstrap credentials are absent', async () => {
    const username = process.env.ADMIN_BOOTSTRAP_USERNAME;
    const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
    delete process.env.ADMIN_BOOTSTRAP_USERNAME;
    delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
    try {
      const db = new MemoryDatabase();
      await new AdminAuthService(db).ensureBootstrapAdmin();
      expect(await db.collection(collections.adminUsers).count()).toBe(0);
    } finally {
      if (username === undefined) delete process.env.ADMIN_BOOTSTRAP_USERNAME;
      else process.env.ADMIN_BOOTSTRAP_USERNAME = username;
      if (password === undefined) delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
      else process.env.ADMIN_BOOTSTRAP_PASSWORD = password;
    }
  });

  it('requires a 12 character alphanumeric admin password', () => {
    expect(() => validateAdminPassword('admin')).toThrow();
    expect(() => validateAdminPassword('long-password-only')).toThrow();
    expect(() => validateAdminPassword('SecurePassword2026')).not.toThrow();
  });

  it('removes expired admin sessions during login attempts', async () => {
    const db = new MemoryDatabase();
    await db.collection<AdminSessionDoc>(collections.adminSessions).insert({
      _id: 'expired', id: 'expired', adminUserId: 'missing', tokenHash: 'hash',
      expiresAt: '2020-01-01T00:00:00.000Z', revokedAt: null, createdAt: '2020-01-01T00:00:00.000Z',
    });
    await expect(new AdminAuthService(db).login('missing', 'missing')).rejects.toMatchObject({ status: 401 });
    expect(await db.collection<AdminSessionDoc>(collections.adminSessions).count()).toBe(0);
  });
});

describe('abuse protection', () => {
  it('persists rate-limit counters in the database', async () => {
    const db = new MemoryDatabase();
    const firstInstance = new PersistentRateLimiter(db);
    const secondInstance = new PersistentRateLimiter(db);

    await firstInstance.consume('same-user', 2, 60_000);
    await secondInstance.consume('same-user', 2, 60_000);
    await expect(firstInstance.consume('same-user', 2, 60_000)).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' });
  });

  it('detects avatar type from file signatures rather than extensions', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    const webp = Buffer.from('RIFF0000WEBP', 'ascii');

    expect(validateAvatarUpload(png.toString('base64')).extension).toBe('png');
    expect(validateAvatarUpload(jpeg.toString('base64')).extension).toBe('jpg');
    expect(validateAvatarUpload(webp.toString('base64')).extension).toBe('webp');
    expect(() => validateAvatarUpload(Buffer.from('<script>').toString('base64'))).toThrow();
  });

  it('rejects malformed address data', async () => {
    const services = new BaichileCloudServices(new MemoryDatabase());
    await expect(services.addresses.save({
      name: 'A'.repeat(41), phone: 'not-a-phone', address: '', detail: '', tag: '',
      lat: 999, lng: 999, isDefault: false,
    }, { visitorId: 'visitor_test' })).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
  });
});
