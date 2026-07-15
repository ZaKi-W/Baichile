import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VirtualOrder } from '@baichile/api-contract';
import {
  createOrderEggPresentation,
  hasSeenOrderEgg,
  markOrderEggSeen,
  ORDER_EGG_IMAGE_BASE_URL,
  ORDER_EGG_IMAGE_PATHS,
  orderEggImageUrl,
  orderEggPosterImageUrl,
  orderEggRevealKey,
} from './order-easter-egg';

const startedAt = Date.parse('2026-07-02T08:00:00.000Z');
const order = (overrides: Partial<VirtualOrder> = {}) => ({
  id: 'order-egg-1',
  isVirtual: true,
  storeId: 'store-1',
  virtualDestinationId: 'desk',
  status: 'created',
  startedAt: new Date(startedAt).toISOString(),
  createdAt: new Date(startedAt).toISOString(),
  durationMs: 60_000,
  seed: 'seed-egg',
  route: { id: 'route-1', cityCode: '310000', origin: {}, destination: {}, polyline: [], routeSource: 'generated', label: '虚拟配送路线' },
  lines: [],
  itemsTotalCents: 2200,
  deliveryFeeCents: 0,
  packingFeeCents: 0,
  totalCents: 2200,
  itemsTotalCaloriesKcal: 500,
  ...overrides,
}) as VirtualOrder;

describe('order easter egg presentation', () => {
  const storage = new Map<string, unknown>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('uni', {
      getStorageSync: vi.fn((key: string) => storage.get(key) ?? ''),
      setStorageSync: vi.fn((key: string, value: unknown) => storage.set(key, value)),
    });
  });

  it('keeps collection eggs hidden until the order is completed', () => {
    const collectionOrder = order({
      easterEgg: {
        id: 'zero-bite',
        name: '零口传说',
        rarity: 'rare',
        verdict: '传说有人点遍全城，却从未动过一筷。',
        themeColor: '#D97706',
        decoration: 'spark',
        collectionNumber: '0042',
        triggeredAt: new Date(startedAt + 78_000).toISOString(),
      },
    });

    expect(createOrderEggPresentation(collectionOrder, startedAt + 77_999)).toBeUndefined();
    expect(createOrderEggPresentation(collectionOrder, startedAt + 78_000)).toMatchObject({
      id: 'zero-bite',
      kind: 'collection',
      eyebrow: '发现稀有彩蛋',
      title: '零口传说',
      meta: '稀有收藏 · #0042',
      imageUrl: `${ORDER_EGG_IMAGE_BASE_URL}/collection-zero-bite.webp`,
    });
  });

  it('updates a delivery incident from countdown to its refunded outcome', () => {
    const incidentOrder = order({
      incident: {
        key: 'alien_abduction',
        startedAt: new Date(startedAt + 30_000).toISOString(),
        failedAt: new Date(startedAt + 45_000).toISOString(),
      },
    });

    expect(createOrderEggPresentation(incidentOrder, startedAt + 29_000)).toBeUndefined();
    expect(createOrderEggPresentation(incidentOrder, startedAt + 35_000)).toMatchObject({
      id: 'incident-alien_abduction',
      kind: 'incident',
      state: 'active',
      title: '骑手遭遇了外星人袭击',
      description: '这不是普通延误，结局将在 10 秒后揭晓。',
      imageUrl: `${ORDER_EGG_IMAGE_BASE_URL}/incident-alien-abduction.webp`,
    });
    expect(createOrderEggPresentation({ ...incidentOrder, refundStatus: 'refunded' }, startedAt + 45_000)).toMatchObject({
      state: 'revealed',
      title: '您的外卖已抵达火星，配送失败',
      description: '本单虚拟饭钱已原路退回。',
      meta: '配送彩蛋 · 已退款',
    });
  });

  it('maps all sixteen egg stories to unique hosted artwork and safely falls back', () => {
    const paths = Object.values(ORDER_EGG_IMAGE_PATHS);
    expect(paths).toHaveLength(16);
    expect(new Set(paths).size).toBe(16);
    expect(paths.every((path) => path.endsWith('.webp'))).toBe(true);
    expect(orderEggImageUrl('incident', 'unknown')).toBe('/static/share/order-cover.jpg');
    expect(orderEggImageUrl('collection', 'unknown')).toBe('/static/share/order-cover.jpg');
    expect(orderEggPosterImageUrl('collection', 'zero-bite')).toContain('collection-zero-bite');
    expect(orderEggPosterImageUrl('collection', 'zero-bite')).toMatch(/\.jpg$/);
    expect(orderEggPosterImageUrl('incident', 'unknown')).toBe('/static/share/order-cover.jpg');
  });

  it('stores reveal state per order and egg', () => {
    const key = orderEggRevealKey('order-1', 'egg-1');
    expect(key).toBe('order-egg-reveal:order-1:egg-1');
    expect(hasSeenOrderEgg('order-1', 'egg-1')).toBe(false);

    markOrderEggSeen('order-1', 'egg-1');

    expect(storage.get(key)).toBe(true);
    expect(hasSeenOrderEgg('order-1', 'egg-1')).toBe(true);
  });
});
