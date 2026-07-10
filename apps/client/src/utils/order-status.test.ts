import { describe, expect, it } from 'vitest';
import { getOrderStep, ORDER_STEPS } from './order-status';

describe('order status presentation', () => {
  it('returns the current persisted timeline step from the order start time', () => {
    const startedAt = new Date('2026-07-02T00:00:00.000Z').getTime();

    const deliveryDurationMs = 20 * 60_000;

    expect(getOrderStep(startedAt, deliveryDurationMs, startedAt).label).toBe('已下单');
    expect(getOrderStep(startedAt, deliveryDurationMs, startedAt + 9_000).label).toBe('骑手接单');
    expect(getOrderStep(startedAt, deliveryDurationMs, startedAt + 18_000).label).toBe('配送中');
    expect(getOrderStep(startedAt, deliveryDurationMs, startedAt + 18_000 + deliveryDurationMs - 1)).toBe(ORDER_STEPS[5]);
    expect(getOrderStep(startedAt, deliveryDurationMs, startedAt + 18_000 + deliveryDurationMs)).toBe(ORDER_STEPS[6]);
    expect(ORDER_STEPS[6]).toMatchObject({ key: 'completed', label: '已送达', listLabel: '已完成' });
  });
});
