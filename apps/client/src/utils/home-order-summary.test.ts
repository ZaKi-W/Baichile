import { describe, expect, it } from 'vitest';
import type { VirtualOrder } from '@baichile/api-contract';
import {
  createHomeOrderSummary,
  createVisibleHomeOrderSummaries,
  homeOrderSeenKey,
} from './home-order-summary';

const startedAt = Date.parse('2026-07-02T08:00:00.000Z');
const order = (overrides: Partial<VirtualOrder> = {}) => ({
  id: 'order-1',
  isVirtual: true,
  storeId: 'store-1',
  virtualDestinationId: 'desk',
  status: 'created',
  startedAt: new Date(startedAt).toISOString(),
  durationMs: 60_000,
  seed: 'seed-0',
  route: { id: 'route-1', cityCode: '310000', origin: {}, destination: {}, polyline: [], routeSource: 'generated', label: '虚拟配送路线' },
  lines: [{ menuItemId: 'food-1', name: '牛肉饭', optionNames: [], quantity: 1, unitPriceCents: 2200, totalCents: 2200, unitCaloriesKcal: 500, totalCaloriesKcal: 500 }],
  itemsTotalCents: 2200,
  deliveryFeeCents: 0,
  packingFeeCents: 0,
  totalCents: 2200,
  itemsTotalCaloriesKcal: 500,
  ...overrides,
}) as VirtualOrder;

describe('home order summary', () => {
  it('reports normal status and remaining time', () => {
    const summary = createHomeOrderSummary(order(), startedAt + 18_000);

    expect(summary.statusLabel).toBe('配送中');
    expect(summary.remainingMs).toBe(60_000);
    expect(summary.terminal).toBe(false);
    expect(summary.itemText).toBe('牛肉饭');
  });

  it('reports an active incident without revealing it beforehand', () => {
    const incidentOrder = order({
      incident: {
        key: 'alien_abduction',
        startedAt: new Date(startedAt + 30_000).toISOString(),
        failedAt: new Date(startedAt + 45_000).toISOString(),
      },
    });

    expect(createHomeOrderSummary(incidentOrder, startedAt + 29_000).incidentText).toBe('');
    expect(createHomeOrderSummary(incidentOrder, startedAt + 35_000)).toMatchObject({
      statusLabel: '突发事件',
      incidentText: '骑手遭遇了外星人袭击',
      terminal: false,
      remainingMs: 10_000,
    });
  });

  it('reports failed and completed terminal outcomes', () => {
    const failed = order({
      incident: {
        key: 'alien_abduction',
        startedAt: new Date(startedAt + 30_000).toISOString(),
        failedAt: new Date(startedAt + 45_000).toISOString(),
      },
      refundStatus: 'refunded',
    });

    expect(createHomeOrderSummary(failed, startedAt + 45_000)).toMatchObject({
      statusLabel: '配送失败',
      incidentText: '您的外卖已抵达火星，配送失败',
      refundLabel: '已退款',
      remainingMs: 0,
      terminal: true,
    });
    expect(createHomeOrderSummary(order(), startedAt + 78_000)).toMatchObject({
      statusLabel: '已完成',
      remainingMs: 0,
      terminal: true,
    });
  });

  it('only includes orders selected for the current home session', () => {
    const now = startedAt + 180_000;
    const completed = order({ id: 'completed' });
    const active = order({
      id: 'active',
      startedAt: new Date(startedAt + 150_000).toISOString(),
    });

    expect(createVisibleHomeOrderSummaries([completed, active], now, ['completed'])
      .map((summary) => summary.order.id)).toEqual(['completed']);
  });

  it('isolates dismissed-order storage by account', () => {
    expect(homeOrderSeenKey('account-a')).toBe('baichile:home-order-dismissed:account-a');
    expect(homeOrderSeenKey('account-b')).toBe('baichile:home-order-dismissed:account-b');
  });
});
