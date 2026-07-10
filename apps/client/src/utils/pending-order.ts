import type { QuoteRequest } from '@baichile/api-contract';

const PENDING_ORDER_KEY = 'baichile:pending-order';

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
