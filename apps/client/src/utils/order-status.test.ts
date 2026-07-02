import { describe, expect, it } from 'vitest';
import { getOrderStep, ORDER_STEPS } from './order-status';

describe('order status presentation', () => {
  it('returns the current persisted timeline step from the order start time', () => {
    const startedAt = new Date('2026-07-02T00:00:00.000Z').getTime();

    expect(getOrderStep(startedAt, startedAt).label).toBe('已下单');
    expect(getOrderStep(startedAt, startedAt + 18_000).label).toBe('骑手接单');
    expect(getOrderStep(startedAt, startedAt + 83_000).label).toBe('配送中');
    expect(getOrderStep(startedAt, startedAt + 300_000)).toBe(ORDER_STEPS[5]);
  });
});
