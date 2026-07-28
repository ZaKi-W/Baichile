import type {
  CheckoutQuote as ApiCheckoutQuote,
  CheckoutQuoteRequest,
  OrderQuote,
  QuoteRequest,
  VirtualOrder,
} from '@baichile/api-contract';
import type { CheckoutQuote } from '../features/checkout/types';
import { useAuthStore } from '../stores/auth';
import { requestApi } from './http';

export interface CheckoutOrderRequest extends QuoteRequest {
  checkoutId: string;
  quoteId: string;
  idempotencyKey: string;
}

function normalizeStoreQuote(
  raw: ApiCheckoutQuote['stores'][number],
  request: QuoteRequest,
  quoteId: string,
) {
  return {
    storeId: raw.storeId,
    quoteId,
    request,
    quote: raw,
  };
}

function legacyCheckoutQuote(requests: QuoteRequest[], quotes: OrderQuote[]): CheckoutQuote {
  const checkoutId = `legacy-${Date.now().toString(36)}`;
  const quoteId = `legacy-quote-${Date.now().toString(36)}`;
  const normalizedStores = quotes.map((quote, index) => {
    const request = requests[index];
    if (!request) throw new Error(`报价缺少第 ${index + 1} 个店铺请求`);
    return normalizeStoreQuote({
      ...quote,
      storeName: '',
      originalItemsTotalCents: quote.itemsTotalCents,
      minimumOrderCents: 0,
      minimumOrderShortfallCents: 0,
      flashDiscountCents: 0,
      storeDiscountCents: 0,
      promotionDiscountCents: 0,
      promotionSnapshots: [],
    }, request, quoteId);
  });
  return {
    checkoutId,
    quoteId,
    quotedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    checkoutExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    stores: normalizedStores,
    originalItemsTotalCents: quotes.reduce((sum, quote) => sum + quote.itemsTotalCents, 0),
    itemsTotalCents: quotes.reduce((sum, quote) => sum + quote.itemsTotalCents, 0),
    deliveryFeeCents: quotes.reduce((sum, quote) => sum + quote.deliveryFeeCents, 0),
    packingFeeCents: quotes.reduce((sum, quote) => sum + quote.packingFeeCents, 0),
    minimumOrderShortfallCents: 0,
    flashDiscountCents: 0,
    storeDiscountCents: 0,
    promotionDiscountCents: 0,
    totalCents: quotes.reduce((sum, quote) => sum + quote.totalCents, 0),
  };
}

export const checkoutService = {
  async quote(
    requests: QuoteRequest[],
    options: { checkoutId?: string } = {},
  ): Promise<CheckoutQuote> {
    if (!requests.length) throw new Error('购物车为空');
    const auth = useAuthStore();
    await auth.ensureGuest();
    const [first] = requests;
    const body: CheckoutQuoteRequest = {
      checkoutId: options.checkoutId,
      stores: requests.map(({ storeId, lines }) => ({ storeId, lines })),
      virtualDestinationId: first.virtualDestinationId,
      virtualDestinationPoint: first.virtualDestinationPoint,
      deliveryAddressSnapshot: first.deliveryAddressSnapshot,
    };
    try {
      const raw = await requestApi<ApiCheckoutQuote>('POST', '/v1/checkouts/quote', auth.accessToken, body);
      return {
        ...raw,
        stores: raw.stores.map((store) => {
          const request = requests.find((item) => item.storeId === store.storeId);
          if (!request) throw new Error(`报价包含未知店铺：${store.storeId}`);
          return normalizeStoreQuote(store, request, raw.quoteId);
        }),
      };
    } catch (error) {
      // Compatibility for a briefly mixed deployment: only fall back when the
      // aggregate endpoint has not reached the active cloud function yet.
      const code = error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : '';
      if (code !== 'NOT_FOUND') throw error;
      const quotes = await Promise.all(
        requests.map((request) => requestApi<OrderQuote>('POST', '/v1/orders/quote', auth.accessToken, request)),
      );
      return legacyCheckoutQuote(requests, quotes);
    }
  },

  async createOrder(request: CheckoutOrderRequest): Promise<VirtualOrder> {
    const auth = useAuthStore();
    await auth.ensureGuest();
    return requestApi<VirtualOrder>('POST', '/v1/orders/virtual', auth.accessToken, request);
  },
};
