import { describe, expect, it } from 'vitest';
import { normalizeAdminPage } from '../src/admin/admin-query.service';

describe('admin query helpers', () => {
  it('clamps pagination to safe boundaries', () => {
    expect(normalizeAdminPage({ page: '0', pageSize: '500' }))
      .toEqual({ page: 1, pageSize: 100, skip: 0 });
    expect(normalizeAdminPage({ page: '3', pageSize: '20' }))
      .toEqual({ page: 3, pageSize: 20, skip: 40 });
    expect(normalizeAdminPage({ page: 'bad', pageSize: undefined }))
      .toEqual({ page: 1, pageSize: 20, skip: 0 });
  });
});
