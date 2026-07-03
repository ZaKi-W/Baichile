import { describe, expect, it } from 'vitest';
import { canAccess, centsToYuan, yuanToCents } from './utils';
import { toQuery } from './api/http';

describe('admin UI helpers', () => {
  it('checks permissions', () => {
    expect(canAccess(['catalog:read'], 'catalog:read')).toBe(true);
    expect(canAccess(['catalog:read'], 'wallet:adjust')).toBe(false);
  });

  it('converts currency at the API boundary', () => {
    expect(centsToYuan(1234)).toBe('12.34');
    expect(yuanToCents('12.34')).toBe(1234);
  });

  it('omits empty query filters', () => {
    expect(toQuery({ page: 1, keyword: '', status: 'active' }))
      .toBe('?page=1&status=active');
  });
});
