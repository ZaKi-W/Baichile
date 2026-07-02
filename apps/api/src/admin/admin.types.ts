import type { AdminPermission, AdminRole } from '@baichile/api-contract';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export const ALL_ADMIN_PERMISSIONS: AdminPermission[] = [
  'dashboard:read',
  'catalog:read',
  'catalog:write',
  'accounts:read',
  'accounts:write',
  'wallet:read',
  'wallet:adjust',
  'orders:read',
  'orders:write',
  'admins:manage',
  'audit:read',
];

export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  super_admin: ALL_ADMIN_PERMISSIONS,
  operator: [
    'dashboard:read',
    'catalog:read',
    'catalog:write',
    'accounts:read',
    'wallet:read',
    'orders:read',
    'orders:write',
  ],
  support: [
    'dashboard:read',
    'catalog:read',
    'accounts:read',
    'accounts:write',
    'wallet:read',
    'orders:read',
    'orders:write',
  ],
};

export interface AuthenticatedAdmin {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  permissions: AdminPermission[];
}

export function canAdmin(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export async function hashAdminPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const digest = await scryptAsync(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${digest.toString('hex')}`;
}

export async function verifyAdminPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, expectedHex] = stored.split(':');
  if (algorithm !== 'scrypt' || !salt || !expectedHex || expectedHex.length !== 128) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = await scryptAsync(password, salt, 64) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function hashAdminToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
