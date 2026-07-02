import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const listOrders = vi.fn();
const loadSavings = vi.fn();

vi.mock('../services/orders', () => ({
  orderService: { list: listOrders, savings: loadSavings },
}));

describe('order store ownership', () => {
  const storage = new Map<string, unknown>();

  beforeEach(() => {
    vi.resetModules();
    listOrders.mockReset();
    loadSavings.mockReset();
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
      request: vi.fn((options: UniApp.RequestOptions) => {
        options.success?.({
          statusCode: 201,
          data: { visitorId: 'visitor_new', accessToken: 'guest.new' },
        } as never);
        return undefined as never;
      }),
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

  it('derives savings from cached completed orders when the API is unavailable', async () => {
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

    await orders.load();

    expect(orders.savings).toEqual({
      savedMoneyCents: 2400,
      savedCaloriesKcal: 560,
      completedOrderCount: 1,
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
    expect(storage.get('baichile:orders:account_me')).toEqual(mine);
  });
});
