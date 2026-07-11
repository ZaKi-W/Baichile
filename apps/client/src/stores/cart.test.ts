import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { MenuItem, StoreDetail } from '@baichile/api-contract';
import { useCartStore } from './cart';

const store = {
  id: 'store-1',
  deliveryFeeCents: 300,
  packingFeeCents: 200,
} as StoreDetail;

const item = {
  id: 'item-1',
  basePriceCents: 1200,
  specGroups: [{
    id: 'size',
    name: '份量',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    options: [{ id: 'standard', name: '标准份', priceDeltaCents: 0, calorieDeltaKcal: 0 }],
  }],
} as MenuItem;

describe('cart pricing', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('charges dish prices plus delivery only', async () => {
    const cart = useCartStore();
    cart.selectStore(store);
    expect(cart.totalCents).toBe(0);

    await cart.add(store, item, ['standard'], 1);
    await cart.add(store, item, ['standard'], 1);

    expect(cart.itemsTotalCents).toBe(2400);
    expect(cart.totalCents).toBe(2700);
    expect(cart.groups[0]?.totalCents).toBe(2700);
  });
});
