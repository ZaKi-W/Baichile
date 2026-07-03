import { describe, expect, it } from 'vitest';
import {
  ROLE_PERMISSIONS,
  canAdmin,
  hashAdminPassword,
  hashAdminToken,
  verifyAdminPassword,
} from '../src/admin/admin.types';
import { validateAdminPassword } from '../src/admin/admin-auth.service';

describe('admin authentication primitives', () => {
  it('maps sensitive permissions only to authorized roles', () => {
    expect(ROLE_PERMISSIONS.super_admin).toContain('wallet:adjust');
    expect(ROLE_PERMISSIONS.operator).not.toContain('wallet:adjust');
    expect(ROLE_PERMISSIONS.operator).toContain('catalog:write');
    expect(ROLE_PERMISSIONS.support).toContain('orders:write');
    expect(ROLE_PERMISSIONS.support).not.toContain('catalog:write');
    expect(canAdmin('support', 'orders:write')).toBe(true);
  });

  it('hashes and verifies passwords without storing plaintext', async () => {
    const password = 'correct horse battery staple';
    const stored = await hashAdminPassword(password);

    expect(stored).toMatch(/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(stored).not.toContain(password);
    await expect(verifyAdminPassword(password, stored)).resolves.toBe(true);
    await expect(verifyAdminPassword('wrong password', stored)).resolves.toBe(false);
  });

  it('hashes opaque session tokens deterministically', () => {
    expect(hashAdminToken('secret-token')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAdminToken('secret-token')).toBe(hashAdminToken('secret-token'));
    expect(hashAdminToken('another-token')).not.toBe(hashAdminToken('secret-token'));
  });

  it('allows simple admin credentials only outside production', () => {
    expect(() => validateAdminPassword('admin', 'development')).not.toThrow();
    expect(() => validateAdminPassword('admin', 'test')).not.toThrow();
    expect(() => validateAdminPassword('admin', 'production')).toThrow('密码至少 10 位');
    expect(() => validateAdminPassword('strong-password', 'production')).not.toThrow();
  });
});
