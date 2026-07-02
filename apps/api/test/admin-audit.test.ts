import { describe, expect, it } from 'vitest';
import { sanitizeAuditData } from '../src/admin/admin-audit.service';

describe('admin audit sanitization', () => {
  it('redacts secrets recursively while preserving useful fields', () => {
    expect(sanitizeAuditData({
      password: 'secret',
      token: 'session',
      name: '测试店铺',
      nested: { passwordHash: 'hash', role: 'operator' },
    })).toEqual({
      password: '[REDACTED]',
      token: '[REDACTED]',
      name: '测试店铺',
      nested: { passwordHash: '[REDACTED]', role: 'operator' },
    });
  });
});
