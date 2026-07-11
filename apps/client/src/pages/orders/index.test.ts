import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('orders card presentation', () => {
  it('shows store, dish summary, paid amount, and action buttons', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('storeThumb(order)');
    expect(source).toContain('storeCovers.value[order.storeId]');
    expect(source).toContain('catalogService.home()');
    expect(source).not.toContain("order.lines.find((line) => line.imageUrl)");
    expect(source).toContain('storeName(order)');
    expect(source).toContain('dishSummary(order)');
    expect(source).toContain('实付');
    expect(source).toContain('再来一单');
    expect(source).toContain('订单详情');
  });

  it('presents failed orders as refunded instead of completed savings', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('配送失败');
    expect(source).toContain('isFailed(order)');
    expect(source).toContain("order.status === 'failed'");
  });

  it('shows the incident story directly in the order list', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('incidentText(order)');
    expect(source).toContain('findDeliveryIncident');
    expect(source).toContain('incident-story');
  });
});
