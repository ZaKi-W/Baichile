import { describe, expect, it } from 'vitest';
import { legacyShareTarget } from './share-navigation';

describe('legacy share navigation', () => {
  it('keeps an order share on the order page when the order has an easter egg', () => {
    expect(legacyShareTarget('order', true)).toBe('/pages/share-order/index');
    expect(legacyShareTarget('order_egg')).toBe('/pages/share-egg/index');
  });
});
