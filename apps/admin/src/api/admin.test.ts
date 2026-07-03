import { describe, expect, it } from 'vitest';
import { menuItemCollectionPath, menuItemPath, menuItemTransferPath } from './admin';

describe('merchant-scoped menu item API paths', () => {
  it('builds all menu item endpoints under the merchant', () => {
    expect(menuItemCollectionPath('store-1')).toBe('/v1/admin/stores/store-1/menu-items');
    expect(menuItemPath('store-1', 'item-2'))
      .toBe('/v1/admin/stores/store-1/menu-items/item-2');
    expect(menuItemTransferPath('store-1', 'item-2'))
      .toBe('/v1/admin/stores/store-1/menu-items/item-2/transfer');
  });
});
