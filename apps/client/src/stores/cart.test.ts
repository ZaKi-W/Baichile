import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { MenuItem, StoreDetail } from '@baichile/api-contract';
import { MAX_CART_QUANTITY, useCartStore } from './cart';

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

  it('charges dish prices plus server-enforced delivery and packing fees', async () => {
    const cart = useCartStore();
    cart.selectStore(store);
    expect(cart.totalCents).toBe(0);

    await cart.add(store, item, ['standard'], 1);
    await cart.add(store, item, ['standard'], 1);

    expect(cart.itemsTotalCents).toBe(2400);
    expect(cart.originalItemsTotalCents).toBe(2400);
    expect(cart.totalCents).toBe(2900);
    expect(cart.groups[0]?.totalCents).toBe(2900);
  });

  it('replaces only the item base price during a flash sale', async () => {
    const cart = useCartStore();
    const itemWithSurcharge = {
      ...item,
      specGroups: [{
        ...item.specGroups[0],
        options: [{
          ...item.specGroups[0]!.options[0],
          priceDeltaCents: 250,
        }],
      }],
    } as MenuItem;

    await cart.add(store, itemWithSurcharge, ['standard'], 1);
    cart.applyPromotion(store.id, item.id, 900, 'promo-1', new Date(Date.now() + 60_000).toISOString());

    expect(cart.lines[0]?.unitPriceCents).toBe(1150);
    expect(cart.originalItemsTotalCents).toBe(1450);
    expect(cart.totalCents).toBe(1650);
  });

  it('uses active store-detail promotions for the same preview total as checkout', async () => {
    const cart = useCartStore();
    const promotedStore = {
      ...store,
      flashSaleItems: [{
        promotionId: 'flash-1',
        menuItemId: item.id,
        storeId: store.id,
        storeName: '活动店',
        name: '活动菜',
        originalPriceCents: 1200,
        flashPriceCents: 900,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 60_000).toISOString(),
      }],
      storePromotions: [{
        promotionId: 'threshold-1',
        storeId: store.id,
        name: '满 15 减 2',
        tiers: [{ thresholdCents: 1500, discountCents: 200 }],
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 60_000).toISOString(),
      }],
    } as StoreDetail;

    await cart.add(promotedStore, item, ['standard'], 2);

    expect(cart.originalItemsTotalCents).toBe(2400);
    expect(cart.itemsTotalCents).toBe(1800);
    expect(cart.groups[0]?.storeDiscountCents).toBe(200);
    expect(cart.totalCents).toBe(2100);
  });

  it('keeps lightweight snapshots and caps every line at 99', async () => {
    const cart = useCartStore();
    await cart.add(store, item, ['standard'], 120);

    expect(cart.lines[0]?.quantity).toBe(MAX_CART_QUANTITY);
    expect(cart.lines[0]?.item).not.toHaveProperty('specGroups');
    expect(cart.store).not.toHaveProperty('menu');

    cart.updateQuantity(cart.lines[0]!.key, 1000);
    expect(cart.lines[0]?.quantity).toBe(MAX_CART_QUANTITY);
  });

  it('refreshes persisted line prices and option names from the latest catalog snapshot', async () => {
    const cart = useCartStore();
    await cart.add(store, item, ['standard'], 2);
    const latestItem = {
      ...item,
      name: '新名称',
      basePriceCents: 1500,
      specGroups: [{
        ...item.specGroups[0],
        options: [{
          ...item.specGroups[0]!.options[0],
          name: '升级份',
          priceDeltaCents: 300,
        }],
      }],
    } as MenuItem;

    cart.refreshStoreSnapshot({
      ...store,
      menu: [latestItem],
    } as StoreDetail);

    expect(cart.lines[0]?.item).toEqual(expect.objectContaining({
      name: '新名称',
      basePriceCents: 1500,
    }));
    expect(cart.lines[0]?.optionNames).toEqual(['升级份']);
    expect(cart.lines[0]?.optionPriceDeltaCents).toBe(300);
    expect(cart.lines[0]?.unitPriceCents).toBe(1800);
    expect(cart.lines[0]?.totalCents).toBe(3600);
    expect(cart.originalItemsTotalCents).toBe(3600);
  });
});
