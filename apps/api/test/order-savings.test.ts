import { describe, expect, it } from 'vitest';
import { summarizeCompletedOrders } from '../src/order.service';

describe('account savings summary', () => {
  it('sums money and calories from completed orders only', () => {
    expect(summarizeCompletedOrders([
      { completed: true, totalCents: 3200, itemsTotalCaloriesKcal: 780 },
      { completed: false, totalCents: 4500, itemsTotalCaloriesKcal: 920 },
      { completed: true, totalCents: 1800, itemsTotalCaloriesKcal: 360 },
    ])).toEqual({
      savedMoneyCents: 5000,
      savedCaloriesKcal: 1140,
      completedOrderCount: 2,
    });
  });

  it('does not count failed orders as savings', () => {
    expect(summarizeCompletedOrders([
      { completed: false, totalCents: 6600, itemsTotalCaloriesKcal: 1200 },
    ])).toEqual({
      savedMoneyCents: 0,
      savedCaloriesKcal: 0,
      completedOrderCount: 0,
    });
  });
});
