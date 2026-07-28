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

const SENSITIVE_AUDIT_KEY = /(?:phone|mobile|email|password|token|secret|authorization|openid|unionid|hash|salt|address|recipient|contact|latitude|longitude)/i;

export function maskIpAddress(value?: string | null): string {
  if (!value) return '—';
  if (value.includes(':')) {
    const sections = value.split(':').filter(Boolean);
    return sections.length > 2 ? `${sections.slice(0, 2).join(':')}:****` : '****';
  }
  const sections = value.split('.');
  return sections.length === 4 ? `${sections[0]}.${sections[1]}.*.*` : '****';
}

function maskText(value: string): string {
  return value
    .replace(/(?:\+?86[- ]?)?(1\d{2})\d{4}(\d{4})/g, '$1****$2')
    .replace(/([\w.+-]{1,2})[\w.+-]*(@[\w.-]+\.[a-z]{2,})/gi, '$1***$2');
}

export function redactAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[内容过深，已隐藏]';
  if (Array.isArray(value)) {
    return value.map((item) => redactAuditValue(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
      key,
      SENSITIVE_AUDIT_KEY.test(key) ? '[已脱敏]' : redactAuditValue(nested, depth + 1),
    ]));
  }
  return typeof value === 'string' ? maskText(value) : value;
}
