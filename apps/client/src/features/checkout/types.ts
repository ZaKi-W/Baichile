import type {
  CheckoutQuote as ApiCheckoutQuote,
  CheckoutStoreQuote as ApiCheckoutStoreQuote,
  PromotionSnapshot,
  QuoteRequest,
  VirtualOrder,
} from '@baichile/api-contract';

export const PENDING_CHECKOUT_VERSION = 2 as const;

export type CheckoutStoreStatus = 'pending' | 'submitting' | 'succeeded' | 'failed' | 'blocked';

export type QuotedStore = ApiCheckoutStoreQuote & Partial<{
  originalItemsTotalCents: number;
  flashDiscountCents: number;
  storeDiscountCents: number;
  minimumOrderShortfallCents: number;
}>;
export type { PromotionSnapshot };

export interface CheckoutStoreQuote {
  storeId: string;
  quoteId: string;
  request: QuoteRequest;
  quote: QuotedStore;
}

export interface CheckoutQuote extends Omit<ApiCheckoutQuote, 'stores'> {
  stores: CheckoutStoreQuote[];
}

export interface PendingCheckoutStore extends CheckoutStoreQuote {
  idempotencyKey: string;
  status: CheckoutStoreStatus;
  order?: VirtualOrder;
  error?: string;
  errorCode?: string;
}

export interface PendingCheckout {
  version: typeof PENDING_CHECKOUT_VERSION;
  subject: string;
  checkoutId: string;
  expiresAt: string;
  checkoutExpiresAt: string;
  createdAt: string;
  stores: PendingCheckoutStore[];
}

export interface CheckoutSubmissionResult {
  pending: PendingCheckout;
  created: VirtualOrder[];
  failedStoreIds: string[];
  blockedStoreIds: string[];
  needsRequoteStoreIds: string[];
  checkoutSessionInvalid: boolean;
  loginRequired: boolean;
}
