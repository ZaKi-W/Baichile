import { describe, expect, it } from 'vitest';
import { validateAdminPassword } from './admin-security';
import { AdminAuthService } from './admin-services';
import { collections } from './collections';
import { MemoryDatabase } from './database';
import type { AccountDoc } from './models';
import { BaichileRouter } from './router';
import { BaichileCloudServices } from './services';

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

  it('ignores client supplied x-wx-openid headers', async () => {
    const router = new BaichileRouter(new MemoryDatabase());
    const result = await router.handle({
      method: 'POST', path: '/v1/auth/wechat-mini',
      headers: { 'x-wx-openid': 'forged-openid' },
      data: { code: 'forged', profile: { avatarUrl: 'https://example.com/a.png', nickname: '攻击者' } },
    });

    expect(result).toMatchObject({ ok: false, status: 401, code: 'WECHAT_CONTEXT_REQUIRED' });
  });

  it('disables the unauthenticated visitor merge endpoint', async () => {
    const router = new BaichileRouter(new MemoryDatabase());
    const result = await router.handle({
      method: 'POST', path: '/v1/auth/merge-visitor',
      data: { visitorId: 'visitor_victim', accountId: 'account_attacker' },
    });

    expect(result).toMatchObject({ ok: false, status: 401, code: 'ENDPOINT_DISABLED' });
  });
});

describe('admin security', () => {
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
});
