import { describe, expect, it } from 'vitest';
import type { CatalogImportPayload } from '@baichile/api-contract';
import { AdminAuditService } from './admin-services';
import { CatalogImportService, validateCatalogImage } from './catalog-import';
import { collections } from './collections';
import { MemoryDatabase } from './database';
import type { MenuItemDoc } from './models';

const actor = {
  id: 'admin_1',
  username: 'admin',
  displayName: '管理员',
  role: 'super_admin' as const,
  permissions: [],
};

function payload(): CatalogImportPayload {
  return {
    fileName: 'catalog.zip',
    categories: [{ id: 'bbq', name: '烧烤', icon: 'bbq', sortOrder: 10 }],
    stores: [{
      id: 'store-bbq', categoryId: 'bbq', name: '好吃烧烤', description: '现烤', coverUrl: null, tags: ['夜宵'], deliveryFeeCents: 300, packingFeeCents: 100, minimumOrderCents: 2000, virtualDeliveryMinutes: 30, monthlySales: 100, distanceKm: 1.2, rating: 4.8, recentViewers: 5, systemHeat: 10, sourceType: 'original', sortOrder: 10, status: 'active',
    }],
    menuItems: [{
      id: 'item-lamb', storeId: 'store-bbq', categoryId: 'bbq', subCategoryId: null, name: '羊肉串', subtitle: null, imageUrl: null, basePriceCents: 350, caloriesKcal: 130, calorieSource: { type: 'composition_estimate', description: '导入', referenceUrl: '' }, monthlySales: 50, sourceType: 'original', sortOrder: 10, status: 'active',
    }],
    specs: [{
      menuItemId: 'item-lamb', groupId: 'spicy', groupName: '辣度', required: false, minSelect: 0, maxSelect: 1, optionId: 'mild', optionName: '微辣', priceDeltaCents: 0, calorieDeltaKcal: 0, isDefault: true,
    }],
  };
}

describe('catalog imports', () => {
  it('previews, publishes and rolls back a complete catalog batch', async () => {
    const db = new MemoryDatabase();
    const service = new CatalogImportService(db, new AdminAuditService(db));

    await expect(service.preview(payload())).resolves.toMatchObject({
      summary: { categories: { created: 1, updated: 0 }, stores: { created: 1, updated: 0 }, menuItems: { created: 1, updated: 0 }, specRows: 1 },
    });
    const job = await service.publish(payload(), actor);
    const menuItem = await db.collection<MenuItemDoc>(collections.menuItems).get('item-lamb');
    expect(menuItem?.specGroups).toMatchObject([{ id: 'item-lamb:spicy', options: [{ id: 'item-lamb:spicy:mild', isDefault: true }] }]);
    expect((await service.listJobs())[0]).toMatchObject({ id: job.id, status: 'published' });

    await service.rollback(job.id, actor);
    await expect(db.collection(collections.categories).get('bbq')).resolves.toBeNull();
    await expect(db.collection(collections.stores).get('store-bbq')).resolves.toBeNull();
    await expect(db.collection(collections.menuItems).get('item-lamb')).resolves.toBeNull();
  });

  it('rejects unsupported image formats before upload', () => {
    expect(() => validateCatalogImage(Buffer.from('not-an-image').toString('base64')))
      .toThrow('商品图片仅支持 JPEG、PNG 或 WebP');
  });
});
