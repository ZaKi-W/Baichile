import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('StoreCard homepage design', () => {
  it('renders live merchant metrics in the compact reference hierarchy', () => {
    const source = readFileSync(new URL('./StoreCard.vue', import.meta.url), 'utf8');

    expect(source).toContain('store.rating.toFixed(1)');
    expect(source).toContain('store.minimumOrderCents');
    expect(source).toContain('store.deliveryFeeCents');
    expect(source).toContain('store.distanceKm');
    expect(source).toContain('store.virtualDeliveryMinutes');
    expect(source).toContain('store.monthlySales');
    expect(source).toContain('class="merchant-avatar"');
    expect(source).toContain('class="score"');
    expect(source).toContain('class="tag-row"');
    expect(source).toContain('text-overflow: ellipsis');
  });
});
