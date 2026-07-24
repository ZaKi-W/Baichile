import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminAuditService, AdminAuthService, AdminMutationService } from './admin-services';
import { collections } from './collections';
import { MemoryDatabase } from './database';
import type { AccountDoc, AddressDoc, MenuItemDoc, StoreDoc, VirtualOrderDoc, WalletTransactionDoc } from './models';
import { BaichileRouter } from './router';
import { BaichileCloudServices } from './services';

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('reads only three menu items and shares one in-flight home request', async () => {
    const calls: Array<{ name: string; limit?: number }> = [];
    const db = new MemoryDatabase((name, options) => calls.push({ name, limit: options.limit }));
    await db.collection<StoreDoc>(collections.stores).insert(activeStore());
    await Promise.all(Array.from({ length: 120 }, (_, index) => db.collection<MenuItemDoc>(collections.menuItems).insert(activeMenuItem({
      _id: `dish_${index + 1}`,
      id: `dish_${index + 1}`,
      sortOrder: index + 1,
    }))));
    const catalog = new BaichileCloudServices(db).catalog;

    const [first, second] = await Promise.all([catalog.home(), catalog.home()]);

    expect(first).toEqual(second);
    expect(calls.filter((call) => call.name === collections.menuItems)).toEqual([
      { name: collections.menuItems, limit: 3 },
    ]);
  });

  it('loads categories without touching stores or menu items', async () => {
    const calls: string[] = [];
    const db = new MemoryDatabase((name) => calls.push(name));
    await db.collection(collections.categories).insert({ _id: 'cat_1', id: 'cat_1', name: '盖饭', icon: 'rice', sortOrder: 1 });

    const categories = await new BaichileCloudServices(db).catalog.categories();

    expect(categories).toEqual([{ id: 'cat_1', name: '盖饭', icon: 'rice' }]);
    expect(calls).toEqual([collections.categories]);
  });

  it('returns summaries for category and indexed search without loading menus', async () => {
    const calls: string[] = [];
    const db = new MemoryDatabase((name) => calls.push(name));
    await db.collection<StoreDoc>(collections.stores).insert(activeStore({ searchText: '白吃小馆\n招牌牛肉面' }));
    const catalog = new BaichileCloudServices(db).catalog;

    const categoryRows = await catalog.list('cat_1');
    const searchRows = await catalog.list(undefined, '牛肉面');

    expect(categoryRows).toHaveLength(1);
    expect(searchRows).toHaveLength(1);
    expect(categoryRows[0]).not.toHaveProperty('menu');
    expect(searchRows[0]).not.toHaveProperty('menu');
    expect(calls).toEqual([collections.stores, collections.stores]);
  });

  it('falls back to menu-name search before search text is backfilled', async () => {
    const db = new MemoryDatabase();
    await db.collection<StoreDoc>(collections.stores).insert(activeStore());
    await db.collection<MenuItemDoc>(collections.menuItems).insert(activeMenuItem({ name: '香辣鸡腿饭' }));

    const rows = await new BaichileCloudServices(db).catalog.list(undefined, '鸡腿');

    expect(rows.map((row) => row.id)).toEqual(['store_1']);
  });

  it('accepts query parameters supplied by the HTTP gateway', async () => {
    const db = new MemoryDatabase();
    await db.collection<StoreDoc>(collections.stores).insert(activeStore({ searchText: '白吃小馆 招牌牛肉面' }));
    await db.collection<StoreDoc>(collections.stores).insert(activeStore({
      _id: 'store_2', id: 'store_2', categoryId: 'cat_2', name: '第二食堂', searchText: '第二食堂 炒饭',
    }));
    const router = new BaichileRouter(db);

    const category = await router.handle({
      method: 'GET', path: '/v1/catalog/stores', queryStringParameters: { categoryId: 'cat_1' },
    });
    const search = await router.handle({
      method: 'GET', path: '/v1/catalog/search', rawQueryString: 'q=%E7%89%9B%E8%82%89%E9%9D%A2',
    });

    expect(category).toMatchObject({ ok: true, data: [{ id: 'store_1' }] });
    expect(search).toMatchObject({ ok: true, data: [{ id: 'store_1' }] });
  });
});

describe('catalog search maintenance', () => {
  const actor = {
    id: 'admin_1',
    username: 'admin',
    displayName: '管理员',
    role: 'super_admin' as const,
    permissions: [],
  };

  it('refreshes store search text after menu edits and transfers', async () => {
    const db = new MemoryDatabase();
    await db.collection<StoreDoc>(collections.stores).insert(activeStore());
    await db.collection<StoreDoc>(collections.stores).insert(activeStore({
      _id: 'store_2', id: 'store_2', name: '第二食堂', searchText: '第二食堂',
    }));
    await db.collection<MenuItemDoc>(collections.menuItems).insert(activeMenuItem());
    const mutations = new AdminMutationService(db, new AdminAuthService(db), new AdminAuditService(db));

    await mutations.saveMenuItem('store_1', 'dish_1', { ...activeMenuItem(), name: '香辣鸡腿饭' }, actor);
    expect((await db.collection<StoreDoc>(collections.stores).get('store_1'))?.searchText).toContain('香辣鸡腿饭');

    await mutations.transferMenuItem('store_1', 'dish_1', { targetStoreId: 'store_2' }, actor);
    expect((await db.collection<StoreDoc>(collections.stores).get('store_1'))?.searchText).not.toContain('香辣鸡腿饭');
    expect((await db.collection<StoreDoc>(collections.stores).get('store_2'))?.searchText).toContain('香辣鸡腿饭');
  });
});

describe('order detail snapshots', () => {
  it('rejects unsafe quantities and oversized carts', async () => {
    const db = new MemoryDatabase();
    await db.collection<StoreDoc>(collections.stores).insert(activeStore());
    await db.collection<MenuItemDoc>(collections.menuItems).insert(activeMenuItem());
    const services = new BaichileCloudServices(db);

    await expect(services.orders.quote({
      storeId: 'store_1', virtualDestinationId: 'addr_1',
      lines: [{ menuItemId: 'dish_1', optionIds: [], quantity: 100 }],
    })).rejects.toMatchObject({ code: 'INVALID_QUANTITY' });

    await expect(services.orders.quote({
      storeId: 'store_1', virtualDestinationId: 'addr_1',
      lines: Array.from({ length: 51 }, () => ({ menuItemId: 'dish_1', optionIds: [], quantity: 1 })),
    })).rejects.toMatchObject({ code: 'ORDER_TOO_LARGE' });
  });

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

describe('guest and account order settlement', () => {
  it('creates guest simulations without a wallet and keeps account orders on virtual balance', async () => {
    const db = new MemoryDatabase();
    await db.collection<StoreDoc>(collections.stores).insert(activeStore());
    await db.collection<MenuItemDoc>(collections.menuItems).insert(activeMenuItem());
    const services = new BaichileCloudServices(db);
    const guest = await services.auth.createGuest();
    const request = {
      storeId: 'store_1',
      virtualDestinationId: 'addr_1',
      lines: [{ menuItemId: 'dish_1', optionIds: [], quantity: 1 }],
    };

    const guestOrder = await services.orders.create(request, { visitorId: guest.visitorId });

    expect(guestOrder.settlementMode).toBe('guest_simulation');
    expect(guestOrder.paymentMethod).toBeUndefined();
    expect(await db.collection<AccountDoc>(collections.accounts).count()).toBe(0);
    expect(await db.collection<WalletTransactionDoc>(collections.walletTransactions).count()).toBe(0);

    await services.auth.ensureAccount('account_order');
    const before = await services.wallet.summary('account_order');
    const accountOrder = await services.orders.create(request, { accountId: 'account_order' });
    const after = await services.wallet.summary('account_order');

    expect(accountOrder.settlementMode).toBe('virtual_balance');
    expect(accountOrder.paymentMethod).toBe('virtual_balance');
    expect(after.balanceCents).toBe(before.balanceCents - accountOrder.totalCents);
  });
});

describe('wallet idempotency', () => {
  it('uses a deterministic daily check-in transaction id', async () => {
    const db = new MemoryDatabase();
    const services = new BaichileCloudServices(db);
    await services.auth.ensureAccount('account_me');

    await services.wallet.checkIn('account_me');

    const rows = await db.collection<WalletTransactionDoc>(collections.walletTransactions).list({
      where: { accountId: 'account_me', type: 'daily_checkin' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toMatch(/^daily_checkin_account_me_\d{4}-\d{2}-\d{2}$/);
    await expect(services.wallet.checkIn('account_me')).rejects.toMatchObject({ code: 'ALREADY_CHECKED_IN' });
  });
});

describe('share snapshots', () => {
  it('masks a phone-only account in public share identity', async () => {
    const db = new MemoryDatabase();
    const services = new BaichileCloudServices(db);
    await services.auth.ensureAccount('account_phone_share', {
      phoneHash: 'phone-hash',
      phoneNumber: '13800138000',
      nickname: '13800138000',
    });

    const card = await services.shares.create('account_phone_share', { kind: 'persona', showIdentity: true });
    const landing = await services.shares.landing(card.token);

    expect(landing.identity?.nickname).toBe('138****8000');
  });

  it('creates a stable persona share with optional anonymous identity', async () => {
    const db = new MemoryDatabase();
    const services = new BaichileCloudServices(db);
    await services.auth.ensureAccount('account_share');
    const card = await services.shares.create('account_share', { kind: 'persona', showIdentity: false });
    const landing = await services.shares.landing(card.token);
    expect(card.token).toHaveLength(32);
    expect(landing.kind).toBe('persona');
    expect(landing.identity).toBeUndefined();
    expect(landing.persona?.acronym).toMatch(/^[A-Z]{4}$/);
    expect(landing.posterTheme).toBe('persona');
    expect(card.title).toContain(landing.persona!.acronym);
    expect(card.title).toContain(landing.persona!.name);
  });

  it('separates a completed order report from its optional collection egg', async () => {
    const db = new MemoryDatabase();
    const services = new BaichileCloudServices(db);
    await services.auth.ensureAccount('account_order_share');
    const now = new Date();
    await db.collection<VirtualOrderDoc>(collections.virtualOrders).insert(shareableOrder({
      _id: 'order_collection_share',
      id: 'order_collection_share',
      accountId: 'account_order_share',
      startedAt: new Date(now.getTime() - 120_000).toISOString(),
      easterEgg: { id: 'clean-plate', name: '赛博光盘行动', rarity: 'common', verdict: '一口没吃，盘子却干净得很有态度。', themeColor: '#2E8B72', decoration: 'plate', collectionNumber: '0001', triggeredAt: now.toISOString() },
    }));

    const orderCard = await services.shares.create('account_order_share', { kind: 'order', orderId: 'order_collection_share', showIdentity: true });
    const eggCard = await services.shares.create('account_order_share', { kind: 'order_egg', orderId: 'order_collection_share', showIdentity: true });
    const [orderLanding, eggLanding] = await Promise.all([services.shares.landing(orderCard.token), services.shares.landing(eggCard.token)]);

    expect(orderCard.path).toContain('/pages/share-order/index');
    expect(orderLanding.easterEgg).toBeUndefined();
    expect(eggCard.path).toContain('/pages/share-egg/index');
    expect(eggLanding.kind).toBe('order_egg');
    expect(eggLanding.easterEgg?.id).toBe('clean-plate');
  });

  it('allows a failed delivery-incident order and egg to be shared independently', async () => {
    const db = new MemoryDatabase();
    const services = new BaichileCloudServices(db);
    await services.auth.ensureAccount('account_incident_share');
    const now = new Date();
    await db.collection<VirtualOrderDoc>(collections.virtualOrders).insert({
      _id: 'order_incident_share',
      id: 'order_incident_share',
      visitorId: null,
      accountId: 'account_incident_share',
      status: 'created',
      storeId: 'store_1',
      storeName: '彩蛋小馆',
      destinationId: 'addr_1',
      startedAt: new Date(now.getTime() - 40_000).toISOString(),
      durationMs: 60_000,
      seed: 'incident-share',
      itemsTotalCents: 1200,
      deliveryFeeCents: 200,
      packingFeeCents: 0,
      totalCents: 1400,
      itemsTotalCaloriesKcal: 600,
      lines: [],
      route: {
        id: 'route_incident_share', cityCode: '310000',
        origin: { lat: 31.24, lng: 121.48, coordSystem: 'gcj02' },
        destination: { lat: 31.23, lng: 121.47, coordSystem: 'gcj02' },
        polyline: [], routeSource: 'prebuilt', label: '虚拟配送路线',
      },
      incidentKey: 'alien_abduction',
      incidentStartedAt: new Date(now.getTime() - 20_000).toISOString(),
      failedAt: new Date(now.getTime() - 5_000).toISOString(),
      refundedAt: now.toISOString(),
      easterEgg: null,
      adminStatus: 'normal',
      adminNote: '',
      createdAt: new Date(now.getTime() - 40_000).toISOString(),
      updatedAt: now.toISOString(),
    });

    const orderCard = await services.shares.create('account_incident_share', {
      kind: 'order', orderId: 'order_incident_share', showIdentity: true,
    });
    const eggCard = await services.shares.create('account_incident_share', {
      kind: 'order_egg', orderId: 'order_incident_share', showIdentity: true,
    });
    const [orderLanding, eggLanding] = await Promise.all([
      services.shares.landing(orderCard.token),
      services.shares.landing(eggCard.token),
    ]);

    expect(orderCard.path).toContain('/pages/share-order/index');
    expect(orderLanding.kind).toBe('order');
    expect(orderLanding.easterEgg).toBeUndefined();
    expect(eggCard.path).toContain('/pages/share-egg/index');
    expect(eggLanding.kind).toBe('order_egg');
    expect(eggLanding.storeName).toBe('彩蛋小馆');
    expect(eggLanding.easterEgg).toMatchObject({
      id: 'incident-alien_abduction',
      name: '您的外卖已抵达火星，配送失败',
      verdict: '骑手遭遇了外星人袭击',
      rarity: 'rare',
    });
  });

  it('rejects an egg share without an available egg', async () => {
    const db = new MemoryDatabase();
    const services = new BaichileCloudServices(db);
    await services.auth.ensureAccount('account_no_egg');
    await db.collection<VirtualOrderDoc>(collections.virtualOrders).insert(shareableOrder({
      _id: 'order_no_egg', id: 'order_no_egg', accountId: 'account_no_egg', easterEgg: null,
    }));

    await expect(services.shares.create('account_no_egg', { kind: 'order_egg', orderId: 'order_no_egg' }))
      .rejects.toMatchObject({ code: 'EASTER_EGG_REQUIRED' });
  });

  it('keeps rewards and referrals exclusive to reward shares', async () => {
    const db = new MemoryDatabase();
    const services = new BaichileCloudServices(db);
    await Promise.all(['account_inviter', 'account_reward_invitee', 'account_regular_invitee'].map((id) => services.auth.ensureAccount(id)));

    const regular = await services.shares.create('account_inviter', { kind: 'achievement' });
    const reward = await services.shares.create('account_inviter', { kind: 'reward' });
    const legacyInvitation = await services.shares.create('account_inviter', { kind: 'invitation' });
    const regularResult = await services.shares.rewardInitiatedShare('account_inviter', regular.token);
    const rewardResult = await services.shares.rewardInitiatedShare('account_inviter', reward.token);
    await services.shares.completeReferral('account_regular_invitee', regular.token);
    await services.shares.completeReferral('account_reward_invitee', reward.token);

    expect(regularResult.granted).toBe(false);
    expect(rewardResult.granted).toBe(true);
    expect((await services.shares.landing(reward.token)).kind).toBe('reward');
    expect(legacyInvitation.path).toContain('/pages/share-reward/index');
    expect((await services.shares.landing(legacyInvitation.token)).kind).toBe('reward');
    expect((await services.wallet.summary('account_regular_invitee')).balanceCents).toBe(300_000);
    expect((await services.wallet.summary('account_reward_invitee')).balanceCents).toBe(400_000);
  });

  it('builds a cumulative report from completed order totals only', async () => {
    const db = new MemoryDatabase();
    const services = new BaichileCloudServices(db);
    await services.auth.ensureAccount('account_report');
    await db.collection<VirtualOrderDoc>(collections.virtualOrders).insert(shareableOrder({ _id: 'report_one', id: 'report_one', accountId: 'account_report', totalCents: 1800, itemsTotalCaloriesKcal: 700 }));
    await db.collection<VirtualOrderDoc>(collections.virtualOrders).insert(shareableOrder({ _id: 'report_two', id: 'report_two', accountId: 'account_report', totalCents: 2400, itemsTotalCaloriesKcal: 900 }));
    await db.collection<VirtualOrderDoc>(collections.virtualOrders).insert(shareableOrder({ _id: 'report_failed', id: 'report_failed', accountId: 'account_report', status: 'failed', totalCents: 9999, itemsTotalCaloriesKcal: 9999 }));

    const card = await services.shares.create('account_report', { kind: 'achievement' });
    const landing = await services.shares.landing(card.token);

    expect(card.path).toContain('/pages/share-achievement/index');
    expect(landing.completedOrderCount).toBe(2);
    expect(landing.savedMoneyCents).toBe(4200);
    expect(landing.savedCaloriesKcal).toBe(1600);
  });
});

describe('phone account merge', () => {
  it('keeps the WeChat account canonical and is idempotent', async () => {
    const previousAppId = process.env.WECHAT_MINI_APP_ID;
    const previousSecret = process.env.WECHAT_MINI_APP_SECRET;
    process.env.WECHAT_MINI_APP_ID = 'wx-test';
    process.env.WECHAT_MINI_APP_SECRET = 'secret-test';
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/stable_token')) {
        return new Response(JSON.stringify({ access_token: 'wechat-access-token', expires_in: 7200 }), { status: 200 });
      }
      return new Response(JSON.stringify({
        errcode: 0,
        phone_info: { phoneNumber: '13800138000', purePhoneNumber: '13800138000', countryCode: '86' },
      }), { status: 200 });
    }));
    try {
      const db = new MemoryDatabase();
      const services = new BaichileCloudServices(db);
      const wechat = await services.auth.loginWechatMini({
        code: 'wechat-code',
        profile: { nickname: '小程序昵称', avatarUrl: 'https://example.com/wechat.png' },
      }, 'wechat-openid');
      const phone = await services.auth.loginWebPhone('web-phone-uid', '13800138000');
      await db.collection<VirtualOrderDoc>(collections.virtualOrders).insert(shareableOrder({
        _id: 'web_order',
        id: 'web_order',
        accountId: phone.accountId,
        settlementMode: 'virtual_balance',
      }));
      await db.collection<AddressDoc>(collections.addresses).insert({
        _id: 'addr_wechat',
        id: 'addr_wechat',
        visitorId: null,
        accountId: wechat.accountId,
        name: '小白',
        phone: '13800138000',
        address: '上海市测试路 1 号',
        detail: '101',
        tag: '家',
        lat: 31.2,
        lng: 121.4,
        isDefault: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      await db.collection<AddressDoc>(collections.addresses).insert({
        _id: 'addr_web_duplicate',
        id: 'addr_web_duplicate',
        visitorId: null,
        accountId: phone.accountId,
        name: 'Web 用户',
        phone: '13800138000',
        address: '上海市测试路 1 号',
        detail: '101',
        tag: '家',
        lat: 31.2,
        lng: 121.4,
        isDefault: true,
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      });

      const first = await services.auth.bindWechatPhone('wechat-openid', 'phone-code');
      const balanceAfterFirst = (await services.wallet.summary(wechat.accountId)).balanceCents;
      const second = await services.auth.bindWechatPhone('wechat-openid', 'phone-code-2');

      expect(first.merged).toBe(true);
      expect(first.migrated.orders).toBe(1);
      expect(first.migrated.addresses).toBe(1);
      expect(first.migrated.walletTransactions).toBe(1);
      expect(first.session.profile).toEqual({
        nickname: '小程序昵称',
        avatarUrl: 'https://example.com/wechat.png',
      });
      expect(balanceAfterFirst).toBe(600_000);
      expect(second.merged).toBe(false);
      expect((await services.wallet.summary(wechat.accountId)).balanceCents).toBe(balanceAfterFirst);
      expect(await db.collection<AddressDoc>(collections.addresses).count({ accountId: wechat.accountId })).toBe(1);
      expect(await db.collection<VirtualOrderDoc>(collections.virtualOrders).get('web_order'))
        .toMatchObject({ accountId: wechat.accountId });
      expect(await db.collection<AccountDoc>(collections.accounts).get(phone.accountId))
        .toMatchObject({ status: 'disabled', mergedIntoAccountId: wechat.accountId, balanceCents: 0 });
      const transactions = await db.collection<WalletTransactionDoc>(collections.walletTransactions)
        .list({ where: { accountId: wechat.accountId }, orderBy: [['createdAt', 'asc']] });
      const chronological = transactions
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
      expect(chronological.map((row) => row.balanceAfterCents)).toEqual([300_000, 600_000]);
    } finally {
      if (previousAppId === undefined) delete process.env.WECHAT_MINI_APP_ID;
      else process.env.WECHAT_MINI_APP_ID = previousAppId;
      if (previousSecret === undefined) delete process.env.WECHAT_MINI_APP_SECRET;
      else process.env.WECHAT_MINI_APP_SECRET = previousSecret;
    }
  });
});

function shareableOrder(overrides: Partial<VirtualOrderDoc> = {}): VirtualOrderDoc {
  const now = new Date();
  return {
    _id: 'shareable_order',
    id: 'shareable_order',
    visitorId: null,
    accountId: 'account_share',
    status: 'created',
    storeId: 'store_1',
    storeName: '白吃小馆',
    destinationId: 'addr_1',
    startedAt: new Date(now.getTime() - 120_000).toISOString(),
    durationMs: 45_000,
    seed: 'shareable-seed',
    itemsTotalCents: 1200,
    deliveryFeeCents: 200,
    packingFeeCents: 100,
    totalCents: 1500,
    itemsTotalCaloriesKcal: 600,
    lines: [{ menuItemId: 'dish_1', name: '招牌饭', imageUrl: null, optionNames: [], quantity: 1, unitPriceCents: 1200, totalCents: 1200, unitCaloriesKcal: 600, totalCaloriesKcal: 600 }],
    route: {
      id: 'shareable_route', cityCode: '310000',
      origin: { lat: 31.24, lng: 121.48, coordSystem: 'gcj02' },
      destination: { lat: 31.23, lng: 121.47, coordSystem: 'gcj02' },
      polyline: [], routeSource: 'prebuilt', label: '虚拟配送路线',
    },
    incidentKey: null,
    incidentStartedAt: null,
    failedAt: null,
    refundedAt: null,
    easterEgg: null,
    adminStatus: 'normal',
    adminNote: '',
    createdAt: new Date(now.getTime() - 120_000).toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}
