import { describe, expect, it } from 'vitest';
import { collections } from './collections';
import { GameplayService, PromotionService } from './commerce';
import { MemoryDatabase } from './database';
import type { MenuItemDoc, PromotionCampaignDoc, StoreDoc } from './models';
import { canAdmin } from './admin-security';

describe('promotion and gameplay configuration', () => {
  it('allows operators to manage promotions and support users to read only', () => {
    expect(canAdmin('operator', 'promotions:write')).toBe(true);
    expect(canAdmin('support', 'promotions:read')).toBe(true);
    expect(canAdmin('support', 'promotions:write')).toBe(false);
  });

  it('rejects overlapping published campaigns for the same target', async () => {
    const db = new MemoryDatabase();
    const now = new Date().toISOString();
    await db.collection<StoreDoc>(collections.stores).insert({
      _id: 'store_1',
      id: 'store_1',
      categoryId: 'cat_1',
      name: '测试店',
      description: '',
      tags: [],
      deliveryFeeCents: 0,
      packingFeeCents: 0,
      minimumOrderCents: 0,
      virtualDeliveryMinutes: 20,
      monthlySales: 0,
      distanceKm: 1,
      rating: 5,
      recentViewers: 0,
      systemHeat: 0,
      sourceType: 'original',
      sortOrder: 1,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await db.collection<MenuItemDoc>(collections.menuItems).insert({
      _id: 'dish_1',
      id: 'dish_1',
      storeId: 'store_1',
      categoryId: 'cat_1',
      name: '测试菜',
      basePriceCents: 1000,
      caloriesKcal: 100,
      calorieSource: {},
      monthlySales: 0,
      specGroups: [],
      sourceType: 'original',
      sortOrder: 1,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    const promotions = new PromotionService(db);
    const first = await promotions.save(undefined, {
      id: 'flash_1',
      name: '第一场',
      type: 'item_flash',
      storeId: 'store_1',
      menuItemId: 'dish_1',
      flashPriceCents: 800,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-01-02T00:00:00.000Z',
    });
    const second = await promotions.save(undefined, {
      id: 'flash_2',
      name: '第二场',
      type: 'item_flash',
      storeId: 'store_1',
      menuItemId: 'dish_1',
      flashPriceCents: 700,
      startsAt: '2026-01-01T12:00:00.000Z',
      endsAt: '2026-01-03T00:00:00.000Z',
    });
    await promotions.publish(first.id);

    await expect(promotions.publish(second.id)).rejects.toMatchObject({ code: 'PROMOTION_OVERLAP' });
    await expect(promotions.remove(first.id)).rejects.toMatchObject({ code: 'PROMOTION_MUST_BE_PAUSED' });
    await promotions.pause(first.id);
    await expect(promotions.remove(first.id)).resolves.toMatchObject({ id: first.id });
  });

  it('serializes concurrent publishes for an overlapping target', async () => {
    const db = new MemoryDatabase();
    const now = new Date().toISOString();
    await db.collection<StoreDoc>(collections.stores).insert({
      _id: 'store_concurrent',
      id: 'store_concurrent',
      categoryId: 'cat_1',
      name: '并发测试店',
      description: '',
      tags: [],
      deliveryFeeCents: 0,
      packingFeeCents: 0,
      minimumOrderCents: 0,
      virtualDeliveryMinutes: 20,
      monthlySales: 0,
      distanceKm: 1,
      rating: 5,
      recentViewers: 0,
      systemHeat: 0,
      sourceType: 'original',
      sortOrder: 1,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await db.collection<MenuItemDoc>(collections.menuItems).insert({
      _id: 'dish_concurrent',
      id: 'dish_concurrent',
      storeId: 'store_concurrent',
      categoryId: 'cat_1',
      name: '并发测试菜',
      basePriceCents: 1000,
      caloriesKcal: 100,
      calorieSource: {},
      monthlySales: 0,
      specGroups: [],
      sourceType: 'original',
      sortOrder: 1,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    const promotions = new PromotionService(db);
    const campaigns = await Promise.all([1, 2].map((index) => promotions.save(undefined, {
      id: `concurrent_${index}`,
      name: `并发活动 ${index}`,
      type: 'item_flash',
      storeId: 'store_concurrent',
      menuItemId: 'dish_concurrent',
      flashPriceCents: 800 - index,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-01-02T00:00:00.000Z',
    })));

    const results = await Promise.allSettled(campaigns.map((campaign) => promotions.publish(campaign.id)));

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected'))
      .toMatchObject({ reason: { code: 'PROMOTION_OVERLAP' } });
    expect(await db.collection<PromotionCampaignDoc>(collections.promotionCampaigns)
      .count({ lifecycleStatus: 'published' })).toBe(1);
  });

  it('serializes concurrent edits of published campaigns across service instances', async () => {
    const db = new MemoryDatabase();
    const now = new Date().toISOString();
    await db.collection<StoreDoc>(collections.stores).insert({
      _id: 'store_concurrent_edit',
      id: 'store_concurrent_edit',
      categoryId: 'cat_1',
      name: '并发改期测试店',
      description: '',
      tags: [],
      deliveryFeeCents: 0,
      packingFeeCents: 0,
      minimumOrderCents: 0,
      virtualDeliveryMinutes: 20,
      monthlySales: 0,
      distanceKm: 1,
      rating: 5,
      recentViewers: 0,
      systemHeat: 0,
      sourceType: 'original',
      sortOrder: 1,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    const firstInstance = new PromotionService(db);
    const secondInstance = new PromotionService(db);
    const first = await firstInstance.save(undefined, {
      id: 'threshold_edit_1',
      name: '第一档',
      type: 'store_threshold',
      storeId: 'store_concurrent_edit',
      tiers: [{ thresholdCents: 1_000, discountCents: 100 }],
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-01-02T00:00:00.000Z',
    });
    const second = await secondInstance.save(undefined, {
      id: 'threshold_edit_2',
      name: '第二档',
      type: 'store_threshold',
      storeId: 'store_concurrent_edit',
      tiers: [{ thresholdCents: 2_000, discountCents: 300 }],
      startsAt: '2026-01-03T00:00:00.000Z',
      endsAt: '2026-01-04T00:00:00.000Z',
    });
    await firstInstance.publish(first.id);
    await secondInstance.publish(second.id);

    const sharedInterval = {
      startsAt: '2026-01-05T00:00:00.000Z',
      endsAt: '2026-01-06T00:00:00.000Z',
      lifecycleStatus: 'published',
    };
    const results = await Promise.allSettled([
      firstInstance.save(first.id, {
        ...first,
        ...sharedInterval,
      }),
      secondInstance.save(second.id, {
        ...second,
        ...sharedInterval,
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected'))
      .toMatchObject({ reason: { code: 'PROMOTION_OVERLAP' } });
    const published = await db.collection<PromotionCampaignDoc>(collections.promotionCampaigns)
      .list({ where: { lifecycleStatus: 'published' }, orderBy: [['startsAt', 'asc']] });
    expect(published).toHaveLength(2);
    expect(published[0]!.endsAt <= published[1]!.startsAt).toBe(true);
  });

  it('validates probability fields and persists the default gameplay document', async () => {
    const db = new MemoryDatabase();
    const gameplay = new GameplayService(db);

    await expect(gameplay.update({ deliveryIncidentRate: 1.1 }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(gameplay.update({
      firstCheckoutGuaranteed: false,
      deliveryIncidentRate: 0.25,
      successEggRate: 0.4,
    })).resolves.toMatchObject({
      id: 'default',
      firstCheckoutGuaranteed: false,
      deliveryIncidentRate: 0.25,
      successEggRate: 0.4,
    });
  });
});
