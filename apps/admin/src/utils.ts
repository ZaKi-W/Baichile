import type { AdminPermission } from '@baichile/api-contract';

export function canAccess(
  permissions: AdminPermission[],
  permission?: AdminPermission,
): boolean {
  return !permission || permissions.includes(permission);
}

export function centsToYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function yuanToCents(value: string | number): number {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) throw new Error('请输入正确金额');
  return Math.round(amount * 100);
}

export function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  }).format(new Date(value));
}
