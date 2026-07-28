import { describe, expect, it } from 'vitest';
import { calculateProductMetrics } from './admin-services';
import type { AnalyticsEventDoc, VirtualOrderDoc } from './models';

function completedOrder(
  id: string,
  accountId: string,
  createdAt: string,
  promotionDiscountCents = 0,
): VirtualOrderDoc {
  return {
    _id: id,
    id,
    accountId,
    status: 'completed',
    createdAt,
    promotionDiscountCents,
  } as VirtualOrderDoc;
}

describe('dashboard product metrics', () => {
  it('uses the next Shanghai calendar day for D1 and promotion impressions as conversion denominator', () => {
    const orders = [
      completedOrder('a_first', 'account_a', '2026-07-01T15:30:00.000Z'),
      completedOrder('a_d1', 'account_a', '2026-07-02T01:00:00.000Z', 300),
      completedOrder('b_first', 'account_b', '2026-07-01T02:00:00.000Z'),
      completedOrder('b_same_day', 'account_b', '2026-07-01T12:00:00.000Z', 200),
      completedOrder('c_recent', 'account_c', '2026-07-04T12:00:00.000Z'),
    ];
    const accountOrders = new Map<string, VirtualOrderDoc[]>();
    for (const order of orders) {
      const rows = accountOrders.get(order.accountId!) ?? [];
      rows.push(order);
      accountOrders.set(order.accountId!, rows);
    }
    const promotionImpressions = Array.from({ length: 4 }, (_, index) => ({
      _id: `impression_${index}`,
      id: `impression_${index}`,
      eventName: 'promotion.impression',
      payload: {},
      createdAt: '2026-07-01T00:00:00.000Z',
    })) as AnalyticsEventDoc[];

    const metrics = calculateProductMetrics({
      accountOrders,
      orders,
      promotionImpressions,
      firstCheckouts: [],
      visitorSessions: [],
      rewardDaily: [],
      shareConfig: null,
      asOf: new Date('2026-07-05T00:00:00.000Z'),
    });

    expect(metrics.d1EligibleAccountCount).toBe(2);
    expect(metrics.d1ReorderedAccountCount).toBe(1);
    expect(metrics.d1ReorderRate).toBe(0.5);
    expect(metrics.promotionConvertedOrderCount).toBe(2);
    expect(metrics.promotionImpressionEventCount).toBe(4);
    expect(metrics.promotionConversionRate).toBe(0.5);
    expect(metrics.promotionConversionDefinition)
      .toBe('已完成优惠订单数 / promotion.impression 曝光事件数');
  });
});
