const SENSITIVE_KEY = /(password|hash|token|secret|authorization|phone)/i;
const PHONE_VALUE = /(?:\+?86[\s-]?)?1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}/g;
const BEARER_VALUE = /\bbearer\s+[a-zA-Z0-9._~+/=-]+/gi;
const JWT_VALUE = /\beyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g;
const HASH_VALUE = /\b[a-f0-9]{32,}\b/gi;
const NAMED_SECRET_VALUE = /\b(password|token|secret|authorization|phone|hash)\s*[:=]\s*[^\s,;]+/gi;

export function sanitizeForAuditLog(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY.test(key)) return value === undefined ? undefined : '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => sanitizeForAuditLog(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([nestedKey, nestedValue]) => [
        nestedKey,
        sanitizeForAuditLog(nestedValue, nestedKey),
      ]));
  }
  if (typeof value === 'string') return sanitizeLogMessage(value);
  return value;
}

export function sanitizeLogMessage(value: string): string {
  return value
    .replace(NAMED_SECRET_VALUE, '$1=[REDACTED]')
    .replace(BEARER_VALUE, 'Bearer [REDACTED]')
    .replace(JWT_VALUE, '[REDACTED]')
    .replace(PHONE_VALUE, '[REDACTED]')
    .replace(HASH_VALUE, '[REDACTED]')
    .slice(0, 300);
}
