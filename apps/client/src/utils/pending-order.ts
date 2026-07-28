import type { QuoteRequest } from '@baichile/api-contract';
import type { CheckoutQuote, PendingCheckout } from '../features/checkout/types';
import { PENDING_CHECKOUT_VERSION } from '../features/checkout/types';

const PENDING_ORDER_KEY = 'baichile:pending-order';
const PENDING_CHECKOUT_KEY = 'baichile:pending-checkout:v1';
const ACTIVE_CHECKOUT_KEY = 'baichile:active-checkout:v1';

interface ActiveCheckoutSession {
  checkoutId: string;
  checkoutExpiresAt: string;
  subject: string;
}

/**
 * Legacy helpers are kept for one release so an already-open old bundle can
 * still hand its draft to the new checkout page. New code must use the
 * non-destructive pending-checkout helpers below.
 */
export function savePendingOrder(request: QuoteRequest | QuoteRequest[]): void {
  uni.setStorageSync(PENDING_ORDER_KEY, request);
}

export function consumePendingOrder(): QuoteRequest | null {
  const value = uni.getStorageSync(PENDING_ORDER_KEY) as QuoteRequest | QuoteRequest[] | '';
  if (value) uni.removeStorageSync(PENDING_ORDER_KEY);
  return Array.isArray(value) ? value[0] ?? null : value || null;
}

export function consumePendingOrders(): QuoteRequest[] {
  const value = uni.getStorageSync(PENDING_ORDER_KEY) as QuoteRequest | QuoteRequest[] | '';
  if (value) uni.removeStorageSync(PENDING_ORDER_KEY);
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function makeIdempotencyKey(checkoutId: string, storeId: string): string {
  return `${checkoutId}:${storeId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function isPendingCheckout(value: unknown): value is PendingCheckout {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PendingCheckout>;
  return candidate.version === PENDING_CHECKOUT_VERSION
    && typeof candidate.subject === 'string'
    && typeof candidate.checkoutId === 'string'
    && typeof candidate.expiresAt === 'string'
    && typeof candidate.checkoutExpiresAt === 'string'
    && Array.isArray(candidate.stores);
}

export function createPendingCheckout(quote: CheckoutQuote, subject: string): PendingCheckout {
  return {
    version: PENDING_CHECKOUT_VERSION,
    subject,
    checkoutId: quote.checkoutId,
    expiresAt: quote.expiresAt,
    checkoutExpiresAt: quote.checkoutExpiresAt,
    createdAt: new Date().toISOString(),
    stores: quote.stores.map((store) => ({
      ...store,
      idempotencyKey: makeIdempotencyKey(quote.checkoutId, store.storeId),
      status: (store.quote.minimumOrderShortfallCents
        ?? Math.max(0, store.quote.minimumOrderCents - store.quote.itemsTotalCents)) > 0
        ? 'blocked'
        : 'pending',
      error: (store.quote.minimumOrderShortfallCents
        ?? Math.max(0, store.quote.minimumOrderCents - store.quote.itemsTotalCents)) > 0
        ? '未达到店铺起送门槛'
        : undefined,
    })),
  };
}

export function savePendingCheckout(checkout: PendingCheckout): void {
  uni.setStorageSync(PENDING_CHECKOUT_KEY, checkout);
}

export function readPendingCheckout(): PendingCheckout | null {
  const value = uni.getStorageSync(PENDING_CHECKOUT_KEY) as unknown;
  if (isPendingCheckout(value)) return value;
  if (value && typeof value === 'object') {
    const legacy = value as Omit<Partial<PendingCheckout>, 'version'> & { version?: number };
    if (legacy.version === 1
      && typeof legacy.subject === 'string'
      && typeof legacy.checkoutId === 'string'
      && typeof legacy.expiresAt === 'string'
      && Array.isArray(legacy.stores)) {
      const migrated = {
        ...legacy,
        version: PENDING_CHECKOUT_VERSION,
        // V1 did not retain the 30-minute session expiry. Reusing its quote
        // expiry is conservative and forces a safe re-quote.
        checkoutExpiresAt: legacy.expiresAt,
      } as PendingCheckout;
      savePendingCheckout(migrated);
      return migrated;
    }
  }
  return null;
}

export function clearPendingCheckout(): void {
  uni.removeStorageSync(PENDING_CHECKOUT_KEY);
}

export function saveActiveCheckoutSession(quote: CheckoutQuote, subject: string): void {
  uni.setStorageSync(ACTIVE_CHECKOUT_KEY, {
    checkoutId: quote.checkoutId,
    checkoutExpiresAt: quote.checkoutExpiresAt,
    subject,
  } satisfies ActiveCheckoutSession);
}

export function readActiveCheckoutId(expectedSubject = '', now = Date.now()): string {
  const value = uni.getStorageSync(ACTIVE_CHECKOUT_KEY) as Partial<ActiveCheckoutSession> | '';
  if (!value
    || typeof value.checkoutId !== 'string'
    || typeof value.checkoutExpiresAt !== 'string'
    || typeof value.subject !== 'string') {
    if (value) uni.removeStorageSync(ACTIVE_CHECKOUT_KEY);
    return '';
  }
  if (expectedSubject && value.subject !== expectedSubject) {
    uni.removeStorageSync(ACTIVE_CHECKOUT_KEY);
    return '';
  }
  const expiresAt = Date.parse(value.checkoutExpiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    uni.removeStorageSync(ACTIVE_CHECKOUT_KEY);
    return '';
  }
  return value.checkoutId;
}

export function clearActiveCheckoutSession(): void {
  uni.removeStorageSync(ACTIVE_CHECKOUT_KEY);
}

export function isPendingCheckoutExpired(
  checkout: PendingCheckout,
  now = Date.now(),
): boolean {
  const expiresAt = Date.parse(checkout.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

export function isPendingCheckoutSessionExpired(
  checkout: PendingCheckout,
  now = Date.now(),
): boolean {
  const expiresAt = Date.parse(checkout.checkoutExpiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

export function pendingCheckoutMatchesSubject(checkout: PendingCheckout, subject: string): boolean {
  return checkout.subject === subject;
}

export function rebindPendingCheckoutSubject(previousSubject: string, nextSubject: string): void {
  const checkout = readPendingCheckout();
  if (checkout?.subject === previousSubject) {
    savePendingCheckout({ ...checkout, subject: nextSubject });
  }
  const active = uni.getStorageSync(ACTIVE_CHECKOUT_KEY) as Partial<ActiveCheckoutSession> | '';
  if (active && active.subject === previousSubject) {
    uni.setStorageSync(ACTIVE_CHECKOUT_KEY, { ...active, subject: nextSubject });
  }
}

export function pendingCheckoutMatchesRequests(
  checkout: PendingCheckout,
  requests: QuoteRequest[],
): boolean {
  const pendingRequests = checkout.stores
    .filter((store) => store.status !== 'succeeded')
    .map((store) => store.request);
  return requestFingerprint(pendingRequests) === requestFingerprint(requests);
}

export function pendingCheckoutHasWork(checkout: PendingCheckout): boolean {
  return checkout.stores.some((store) => (
    store.status === 'pending'
    || store.status === 'submitting'
    || store.status === 'failed'
  ));
}

export function readLegacyPendingOrders(): QuoteRequest[] {
  const value = uni.getStorageSync(PENDING_ORDER_KEY) as QuoteRequest | QuoteRequest[] | '';
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function clearLegacyPendingOrders(): void {
  uni.removeStorageSync(PENDING_ORDER_KEY);
}

function requestFingerprint(requests: QuoteRequest[]): string {
  return JSON.stringify([...requests]
    .map((request) => ({
      ...request,
      lines: [...request.lines]
        .map((line) => ({ ...line, optionIds: [...line.optionIds].sort() }))
        .sort((left, right) => left.menuItemId.localeCompare(right.menuItemId)),
    }))
    .sort((left, right) => left.storeId.localeCompare(right.storeId)));
}
