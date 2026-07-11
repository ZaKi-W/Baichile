import { describe, expect, it } from 'vitest';
import { collections } from './collections';
import { MemoryDatabase } from './database';
import type { MenuItemDoc, StoreDoc, VirtualOrderDoc } from './models';
import { BaichileCloudServices } from './services';

function activeStore(overrides: Partial<StoreDoc> = {}): StoreDoc {
  const now = new Date().toISOString();
  return {
    _id: 'store_1',
    id: 'store_1',
    categoryId: 'cat_1',
    name: '白吃小馆',
    description: '',
    coverUrl: null,
    tags: [],
    deliveryFeeCents: 200,
    packingFeeCents: 100,
    minimumOrderCents: 0,
    virtualDeliveryMinutes: 30,
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
    ...overrides,
  };
}

function activeMenuItem(overrides: Partial<MenuItemDoc> = {}): MenuItemDoc {
  const now = new Date().toISOString();
  return {
    _id: 'dish_1',
    id: 'dish_1',
    storeId: 'store_1',
    categoryId: 'cat_1',
    subCategoryId: null,
    name: '招牌饭',
    subtitle: null,
    imageUrl: 'https://example.com/dish.webp',
    basePriceCents: 1200,
    caloriesKcal: 600,
    calorieSource: {},
    monthlySales: 0,
    specGroups: [],
    sourceType: 'original',
    sortOrder: 1,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('home catalog', () => {
  it('returns three stable image-backed flash sale items with a display discount', async () => {
    const db = new MemoryDatabase();
    await db.collection<StoreDoc>(collections.stores).insert(activeStore());
    await Promise.all([1, 2, 3, 4].map((sortOrder) => db.collection<MenuItemDoc>(collections.menuItems).insert(activeMenuItem({
      _id: `dish_${sortOrder}`,
      id: `dish_${sortOrder}`,
      name: `招牌饭 ${sortOrder}`,
      sortOrder,
      basePriceCents: 1200 + sortOrder * 100,
    }))));

    const home = await new BaichileCloudServices(db).catalog.home();

    expect(home.flashSaleItems).toHaveLength(3);
    expect(home.flashSaleItems.map((item) => item.menuItemId)).toEqual(['dish_1', 'dish_2', 'dish_3']);
    expect(home.flashSaleItems.every((item) => item.imageUrl && item.flashPriceCents < item.originalPriceCents)).toBe(true);
  });
});

describe('order detail snapshots', () => {
  it('returns and stores store, address, payment, and created time snapshots', async () => {
    const db = new MemoryDatabase();
    await db.collection<StoreDoc>(collections.stores).insert(activeStore());
    await db.collection<MenuItemDoc>(collections.menuItems).insert(activeMenuItem());
    const services = new BaichileCloudServices(db);
    await services.auth.ensureAccount('account_me');

    const order = await services.orders.create({
      storeId: 'store_1',
      virtualDestinationId: 'addr_1',
      virtualDestinationPoint: { lat: 31.23, lng: 121.47, coordSystem: 'gcj02' },
      deliveryAddressSnapshot: {
        name: '王同学',
        phone: '13800000000',
        address: '上海市黄浦区人民广场',
        detail: '1号楼 101',
        tag: '学校',
      },
      lines: [{ menuItemId: 'dish_1', optionIds: [], quantity: 2 }],
    }, 'account_me');

    expect(order.storeName).toBe('白吃小馆');
    expect(order.lines[0]?.imageUrl).toBe('https://example.com/dish.webp');
    expect(order.deliveryAddress).toEqual({
      name: '王同学',
      phone: '13800000000',
      address: '上海市黄浦区人民广场',
      detail: '1号楼 101',
      tag: '学校',
    });
    expect(order.paymentMethod).toBe('virtual_balance');
    expect(order.createdAt).toBe(order.startedAt);
    expect(order.packingFeeCents).toBe(0);
    expect(order.totalCents).toBe(2600);

    const saved = await db.collection<VirtualOrderDoc>(collections.virtualOrders).get(order.id);
    expect(saved?.storeName).toBe('白吃小馆');
    expect(saved?.deliveryAddress).toEqual(order.deliveryAddress);
    expect(saved?.paymentMethod).toBe('virtual_balance');
    expect(saved?.createdAt).toBe(order.createdAt);
  });

  it('keeps old orders readable when snapshot fields are missing', async () => {
    const db = new MemoryDatabase();
    const now = new Date().toISOString();
    await db.collection<VirtualOrderDoc>(collections.virtualOrders).insert({
      _id: 'order_old',
      id: 'order_old',
      visitorId: null,
      accountId: 'account_me',
      status: 'created',
      storeId: 'store_1',
      destinationId: 'addr_1',
      startedAt: now,
      durationMs: 60_000,
      seed: 'legacy',
      itemsTotalCents: 1200,
      deliveryFeeCents: 200,
      packingFeeCents: 100,
      totalCents: 1500,
      itemsTotalCaloriesKcal: 600,
      lines: [],
      route: {
        id: 'route_old',
        cityCode: '310000',
        origin: { lat: 31.24, lng: 121.48, coordSystem: 'gcj02' },
        destination: { lat: 31.23, lng: 121.47, coordSystem: 'gcj02' },
        polyline: [],
        routeSource: 'prebuilt',
        label: '虚拟配送路线',
      },
      incidentKey: null,
      incidentStartedAt: null,
      failedAt: null,
      refundedAt: null,
      adminStatus: 'normal',
      adminNote: '',
      createdAt: now,
      updatedAt: now,
    });

    const [order] = await new BaichileCloudServices(db).orders.list(undefined, 'account_me');

    expect(order.id).toBe('order_old');
    expect(order.deliveryAddress).toBeUndefined();
    expect(order.storeName).toBeUndefined();
    expect(order.paymentMethod).toBe('virtual_balance');
    expect(order.createdAt).toBe(now);
  });
});
