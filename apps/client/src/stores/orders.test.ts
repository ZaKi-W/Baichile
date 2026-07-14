import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const listOrders = vi.fn();
const loadSavings = vi.fn();
const loadDetail = vi.fn();

vi.mock('../services/orders', () => ({
  orderService: { list: listOrders, savings: loadSavings, detail: loadDetail },
}));

describe('order store ownership', () => {
  const storage = new Map<string, unknown>();

  beforeEach(() => {
    vi.resetModules();
    listOrders.mockReset();
    loadSavings.mockReset();
    loadDetail.mockReset();
    loadSavings.mockResolvedValue({
      savedMoneyCents: 0,
      savedCaloriesKcal: 0,
      completedOrderCount: 0,
    });
    storage.clear();
    setActivePinia(createPinia());
    vi.stubGlobal('uni', {
      getStorageSync: vi.fn((key: string) => storage.get(key) ?? ''),
      setStorageSync: vi.fn((key: string, value: unknown) => storage.set(key, value)),
    });
    vi.stubGlobal('wx', {
      cloud: {
        callFunction: vi.fn().mockResolvedValue({
          result: { ok: true, data: { visitorId: 'visitor_new', accessToken: 'guest.new' } },
        }),
      },
    });
  });

  it('loads completed-order savings for the logged-in account', async () => {
    storage.set('baichile:account', {
      accountId: 'account_me',
      accessToken: 'account.token',
      provider: 'wechat',
      profile: { avatarUrl: 'avatar', nickname: '我' },
    });
    storage.set('baichile:visitor', {
      visitorId: 'visitor_me',
      accessToken: 'guest.token',
    });
    listOrders.mockResolvedValue([]);
    loadSavings.mockResolvedValue({
      savedMoneyCents: 6600,
      savedCaloriesKcal: 1280,
      completedOrderCount: 2,
    });
    const { useOrderStore } = await import('./orders');
    const orders = useOrderStore();

    await orders.load();

    expect(orders.savings).toEqual({
      savedMoneyCents: 6600,
      savedCaloriesKcal: 1280,
      completedOrderCount: 2,
    });
  });

  it('does not use cached completed orders when the CloudBase API is unavailable', async () => {
    storage.set('baichile:account', {
      accountId: 'account_me',
      accessToken: 'account.token',
      provider: 'wechat',
      profile: { avatarUrl: 'avatar', nickname: '我' },
    });
    storage.set('baichile:orders:account_me', [{
      id: 'completed',
      startedAt: new Date(Date.now() - 200_000).toISOString(),
      durationMs: 1_000,
      totalCents: 2400,
      itemsTotalCaloriesKcal: 560,
    }]);
    listOrders.mockRejectedValue(new Error('offline'));
    loadSavings.mockRejectedValue(new Error('offline'));
    const { useOrderStore } = await import('./orders');
    const orders = useOrderStore();

    await expect(orders.load()).rejects.toThrow('offline');
    expect(orders.savings).toEqual({
      savedMoneyCents: 0,
      savedCaloriesKcal: 0,
      completedOrderCount: 0,
    });
  });

  it('does not use cached failed incidents when the CloudBase API is unavailable', async () => {
    storage.set('baichile:account', {
      accountId: 'account_me',
      accessToken: 'account.token',
      provider: 'wechat',
      profile: { avatarUrl: 'avatar', nickname: '我' },
    });
    storage.set('baichile:orders:account_me', [{
      id: 'failed',
      startedAt: new Date(Date.now() - 200_000).toISOString(),
      durationMs: 1_000,
      totalCents: 2400,
      itemsTotalCaloriesKcal: 560,
      incident: {
        key: 'alien_abduction',
        startedAt: new Date(Date.now() - 20_000).toISOString(),
        failedAt: new Date(Date.now() - 10_000).toISOString(),
      },
    }]);
    listOrders.mockRejectedValue(new Error('offline'));
    loadSavings.mockRejectedValue(new Error('offline'));
    const { useOrderStore } = await import('./orders');
    const orders = useOrderStore();

    await expect(orders.load()).rejects.toThrow('offline');
    expect(orders.savings).toEqual({
      savedMoneyCents: 0,
      savedCaloriesKcal: 0,
      completedOrderCount: 0,
    });
  });

  it('does not expose cached orders before login', async () => {
    storage.set('baichile:orders', [{ id: 'order_from_another_user' }]);
    const { useOrderStore } = await import('./orders');
    const orders = useOrderStore();

    await orders.load();

    expect(orders.orders).toEqual([]);
    expect(listOrders).not.toHaveBeenCalled();
  });

  it('loads and caches only the logged-in account orders', async () => {
    storage.set('baichile:account', {
      accountId: 'account_me',
      accessToken: 'account.token',
      provider: 'wechat',
      profile: { avatarUrl: 'avatar', nickname: '我' },
    });
    storage.set('baichile:visitor', {
      visitorId: 'visitor_me',
      accessToken: 'guest.token',
    });
    const mine = [{ id: 'order_mine', accountId: 'account_me' }];
    listOrders.mockResolvedValue(mine);
    const { useOrderStore } = await import('./orders');
    const orders = useOrderStore();

    await orders.load();

    expect(orders.orders).toEqual(mine);
    expect(storage.get('baichile:orders:account_me')).toBeUndefined();
  });

  it('force refreshes a cached order detail at completion', async () => {
    storage.set('baichile:account', {
      accountId: 'account_me',
      accessToken: 'account.token',
      provider: 'wechat',
      profile: { avatarUrl: 'avatar', nickname: '我' },
    });
    const cached = { id: 'order-egg', accountId: 'account_me' };
    const refreshed = { id: 'order-egg', accountId: 'account_me', easterEgg: { id: 'egg' } };
    const { useOrderStore } = await import('./orders');
    const orders = useOrderStore();
    orders.orders = [cached] as never[];
    loadDetail.mockResolvedValue(refreshed);

    expect(await orders.fetchDetail('order-egg')).toEqual(cached);
    expect(loadDetail).not.toHaveBeenCalled();

    expect(await orders.fetchDetail('order-egg', { force: true })).toEqual(refreshed);
    expect(loadDetail).toHaveBeenCalledWith('order-egg');
    expect(orders.orders[0]).toEqual(refreshed);
  });
});
