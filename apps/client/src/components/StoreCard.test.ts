import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('StoreCard merchant metrics', () => {
  it('renders sales, rating, distance and fulfilment pricing instead of the virtual description', () => {
    const source = readFileSync(new URL('./StoreCard.vue', import.meta.url), 'utf8');

    expect(source).not.toContain('{{ store.description }}');
    expect(source).toContain('store.rating.toFixed(1)');
    expect(source).toContain('月售 {{ store.monthlySales }}');
    expect(source).toContain('store.distanceKm.toFixed(1)');
    expect(source).toContain('{{ store.virtualDeliveryMinutes }}分钟');
    expect(source).toContain("Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2)");
    expect(source).toContain("value === 0 ? '免配送费' : `配送费 ¥${money(value)}`");
    expect(source).toContain('¥{{ money(store.minimumOrderCents) }}起送');
  });
});
