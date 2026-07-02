import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('orders savings presentation', () => {
  it('replaces price with money and estimated calorie savings after completion', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain("isCompleted(order.startedAt, order.durationMs)");
    expect(source).toContain('省 ¥{{ (order.totalCents / 100).toFixed(2) }}');
    expect(source).toContain('约省 {{ order.itemsTotalCaloriesKcal || 0 }} 千卡');
  });

  it('presents failed orders as refunded instead of completed savings', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('配送失败');
    expect(source).toContain('已退款');
    expect(source).toContain("order.status === 'failed'");
  });
});
