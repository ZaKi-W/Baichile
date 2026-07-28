import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckoutQuote } from '../features/checkout/types';
import {
  createPendingCheckout,
  isPendingCheckoutExpired,
  isPendingCheckoutSessionExpired,
  pendingCheckoutMatchesRequests,
  pendingCheckoutHasWork,
  readActiveCheckoutId,
  readPendingCheckout,
  rebindPendingCheckoutSubject,
  saveActiveCheckoutSession,
  savePendingCheckout,
} from './pending-order';

const storage = new Map<string, unknown>();

describe('recoverable pending checkout', () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('uni', {
      getStorageSync: (key: string) => storage.get(key) || '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, structuredClone(value)),
      removeStorageSync: (key: string) => storage.delete(key),
    });
  });

  it('persists version, subject, expiry and an idempotency key per store without consuming reads', () => {
    const quote: CheckoutQuote = {
      checkoutId: 'checkout-1',
      quoteId: 'quote-1',
      quotedAt: '2098-12-31T23:55:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      checkoutExpiresAt: '2099-01-01T00:25:00.000Z',
      originalItemsTotalCents: 1200,
      itemsTotalCents: 1200,
      deliveryFeeCents: 300,
      packingFeeCents: 0,
      minimumOrderShortfallCents: 0,
      flashDiscountCents: 0,
      storeDiscountCents: 0,
      promotionDiscountCents: 0,
      totalCents: 1500,
      stores: [{
        storeId: 'store-1',
        quoteId: 'quote-1',
        request: {
          storeId: 'store-1',
          virtualDestinationId: 'address-1',
          lines: [{ menuItemId: 'item-1', optionIds: [], quantity: 1 }],
        },
        quote: {
          storeId: 'store-1',
          lines: [],
          itemsTotalCents: 1200,
          deliveryFeeCents: 300,
          packingFeeCents: 0,
          totalCents: 1500,
          itemsTotalCaloriesKcal: 0,
          storeName: '模拟店铺',
          originalItemsTotalCents: 1200,
          minimumOrderCents: 0,
          minimumOrderShortfallCents: 0,
          flashDiscountCents: 0,
          storeDiscountCents: 0,
          promotionDiscountCents: 0,
          promotionSnapshots: [],
        },
      }],
    };

    const pending = createPendingCheckout(quote, 'visitor:visitor-1');
    savePendingCheckout(pending);

    expect(readPendingCheckout()).toEqual(pending);
    expect(readPendingCheckout()).toEqual(pending);
    expect(pending.version).toBe(2);
    expect(pending.checkoutExpiresAt).toBe('2099-01-01T00:25:00.000Z');
    expect(pending.stores[0]?.status).toBe('pending');
    expect(pending.stores[0]?.idempotencyKey).toContain('checkout-1:store-1:');
    expect(isPendingCheckoutExpired(pending, Date.parse('2098-12-31T23:59:59.000Z'))).toBe(false);
    expect(isPendingCheckoutExpired(pending, Date.parse('2099-01-01T00:00:00.000Z'))).toBe(true);
    expect(isPendingCheckoutSessionExpired(pending, Date.parse('2099-01-01T00:24:59.000Z'))).toBe(false);
    expect(isPendingCheckoutSessionExpired(pending, Date.parse('2099-01-01T00:25:00.000Z'))).toBe(true);
    expect(pendingCheckoutMatchesRequests(pending, quote.stores.map((store) => store.request))).toBe(true);
  });

  it('keeps stores below the minimum blocked while eligible stores remain submittable', () => {
    const quote: CheckoutQuote = {
      checkoutId: 'checkout-mixed',
      quoteId: 'quote-mixed',
      quotedAt: '2098-12-31T23:55:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      checkoutExpiresAt: '2099-01-01T00:25:00.000Z',
      originalItemsTotalCents: 1900,
      itemsTotalCents: 1900,
      deliveryFeeCents: 0,
      packingFeeCents: 0,
      minimumOrderShortfallCents: 100,
      flashDiscountCents: 0,
      storeDiscountCents: 0,
      promotionDiscountCents: 0,
      totalCents: 1900,
      stores: [
        {
          storeId: 'eligible',
          quoteId: 'quote-mixed',
          request: {
            storeId: 'eligible',
            virtualDestinationId: 'address-1',
            lines: [{ menuItemId: 'item-1', optionIds: [], quantity: 1 }],
          },
          quote: {
            storeId: 'eligible',
            storeName: '可提交店铺',
            lines: [],
            originalItemsTotalCents: 1200,
            itemsTotalCents: 1200,
            minimumOrderCents: 1200,
            minimumOrderShortfallCents: 0,
            flashDiscountCents: 0,
            storeDiscountCents: 0,
            promotionDiscountCents: 0,
            deliveryFeeCents: 0,
            packingFeeCents: 0,
            totalCents: 1200,
            itemsTotalCaloriesKcal: 0,
            promotionSnapshots: [],
          },
        },
        {
          storeId: 'blocked',
          quoteId: 'quote-mixed',
          request: {
            storeId: 'blocked',
            virtualDestinationId: 'address-1',
            lines: [{ menuItemId: 'item-2', optionIds: [], quantity: 1 }],
          },
          quote: {
            storeId: 'blocked',
            storeName: '未达门槛店铺',
            lines: [],
            originalItemsTotalCents: 700,
            itemsTotalCents: 700,
            minimumOrderCents: 800,
            minimumOrderShortfallCents: 100,
            flashDiscountCents: 0,
            storeDiscountCents: 0,
            promotionDiscountCents: 0,
            deliveryFeeCents: 0,
            packingFeeCents: 0,
            totalCents: 700,
            itemsTotalCaloriesKcal: 0,
            promotionSnapshots: [],
          },
        },
      ],
    };

    const pending = createPendingCheckout(quote, 'visitor:visitor-1');

    expect(pending.stores.map((store) => store.status)).toEqual(['pending', 'blocked']);
    expect(pendingCheckoutHasWork(pending)).toBe(true);
  });

  it('reuses the checkout session until its longer session expiry', () => {
    const quote = {
      checkoutId: 'checkout-session',
      checkoutExpiresAt: '2099-01-01T00:30:00.000Z',
    } as CheckoutQuote;

    saveActiveCheckoutSession(quote, 'visitor:visitor-1');

    expect(readActiveCheckoutId(
      'visitor:visitor-1',
      Date.parse('2099-01-01T00:29:59.000Z'),
    )).toBe('checkout-session');
    expect(readActiveCheckoutId(
      'visitor:visitor-1',
      Date.parse('2099-01-01T00:30:00.000Z'),
    )).toBe('');
  });

  it('isolates an active checkout by subject and rebinds it without requiring a pending draft', () => {
    const quote = {
      checkoutId: 'checkout-subject',
      checkoutExpiresAt: '2099-01-01T00:30:00.000Z',
    } as CheckoutQuote;

    saveActiveCheckoutSession(quote, 'visitor:visitor-1');
    rebindPendingCheckoutSubject('visitor:visitor-1', 'account:account-1');

    expect(readActiveCheckoutId(
      'account:account-1',
      Date.parse('2099-01-01T00:29:59.000Z'),
    )).toBe('checkout-subject');

    saveActiveCheckoutSession(quote, 'account:account-1');
    expect(readActiveCheckoutId(
      'visitor:visitor-2',
      Date.parse('2099-01-01T00:29:59.000Z'),
    )).toBe('');
  });
});
