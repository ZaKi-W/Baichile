import type { VirtualOrder } from '@baichile/api-contract';
import { checkoutService } from '../../services/checkout';
import { trackEvent } from '../../services/analytics';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { useOrderStore } from '../../stores/orders';
import { useWalletStore } from '../../stores/wallet';
import {
  clearActiveCheckoutSession,
  clearPendingCheckout,
  isPendingCheckoutExpired,
  pendingCheckoutHasWork,
  readPendingCheckout,
  savePendingCheckout,
} from '../../utils/pending-order';
import type { CheckoutSubmissionResult, PendingCheckout } from './types';
import { ApiRequestError } from '../../services/http';

export class ExpiredCheckoutError extends Error {
  constructor(readonly pending: PendingCheckout) {
    super('报价已过期，请重新确认');
    this.name = 'ExpiredCheckoutError';
  }
}

const REQUOTE_ERROR_CODES = new Set([
  'CHECKOUT_EXPIRED',
  'INVALID_CHECKOUT',
  'MINIMUM_ORDER_NOT_MET',
  'QUOTE_CHANGED',
  'QUOTE_EXPIRED',
  'QUOTE_MISMATCH',
]);
const INVALID_SESSION_ERROR_CODES = new Set([
  'CHECKOUT_EXPIRED',
  'INVALID_CHECKOUT',
  'QUOTE_MISMATCH',
]);

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '提交失败，请重试';
}

export function virtualBalancePaymentCents(
  order: Pick<VirtualOrder, 'settlementMode' | 'totalCents'>,
): number {
  return order.settlementMode === 'virtual_balance' ? order.totalCents : 0;
}

export function checkoutSubject(): string {
  const auth = useAuthStore();
  if (auth.accountId) return `account:${auth.accountId}`;
  if (auth.visitorId) return `visitor:${auth.visitorId}`;
  return 'anonymous';
}

export async function submitPendingCheckout(
  source: PendingCheckout | null = readPendingCheckout(),
): Promise<CheckoutSubmissionResult | null> {
  if (!source || !pendingCheckoutHasWork(source)) return null;
  if (isPendingCheckoutExpired(source)) {
    void trackEvent('checkout.resume_expired', {
      checkoutId: source.checkoutId,
      storeCount: source.stores.length,
    });
    throw new ExpiredCheckoutError(source);
  }

  const auth = useAuthStore();
  const cart = useCartStore();
  const orders = useOrderStore();
  const wallet = useWalletStore();
  const pending: PendingCheckout = {
    ...source,
    subject: checkoutSubject(),
    stores: source.stores.map((store) => ({
      ...store,
      status: store.status === 'submitting' ? 'pending' : store.status,
    })),
  };
  const created: VirtualOrder[] = [];
  const failedStoreIds: string[] = [];
  const needsRequoteStoreIds: string[] = [];
  let checkoutSessionInvalid = false;
  let paymentRecordedCents = 0;
  const blockedStoreIds = pending.stores
    .filter((store) => store.status === 'blocked')
    .map((store) => store.storeId);

  for (const store of pending.stores) {
    if (store.status === 'succeeded' || store.status === 'blocked') continue;
    store.status = 'submitting';
    store.error = undefined;
    store.errorCode = undefined;
    savePendingCheckout(pending);
    void trackEvent('checkout.store_submit_started', {
      checkoutId: pending.checkoutId,
      storeId: store.storeId,
    }, auth.accessToken);
    try {
      const order = await checkoutService.createOrder({
        ...store.request,
        checkoutId: pending.checkoutId,
        quoteId: store.quoteId,
        idempotencyKey: store.idempotencyKey,
      });
      store.status = 'succeeded';
      store.order = order;
      created.push(order);
      paymentRecordedCents += virtualBalancePaymentCents(order);
      orders.save(order);
      cart.clear(store.storeId);
      savePendingCheckout(pending);
      void trackEvent('checkout.store_submit_succeeded', {
        checkoutId: pending.checkoutId,
        storeId: store.storeId,
        orderId: order.id,
        totalCents: order.totalCents,
      }, auth.accessToken);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'STORE_ORDER_EXISTS') {
        const recovered = await recoverStoreOrder(pending.checkoutId, store.storeId, orders);
        if (recovered) {
          store.status = 'succeeded';
          store.order = recovered;
          created.push(recovered);
          cart.clear(store.storeId);
          savePendingCheckout(pending);
          void trackEvent('checkout.store_submit_succeeded', {
            checkoutId: pending.checkoutId,
            storeId: store.storeId,
            orderId: recovered.id,
            totalCents: recovered.totalCents,
            recovered: true,
          }, auth.accessToken);
          continue;
        }
      }
      store.status = 'failed';
      store.error = errorMessage(error);
      store.errorCode = error instanceof ApiRequestError ? error.code : undefined;
      failedStoreIds.push(store.storeId);
      if (store.errorCode && REQUOTE_ERROR_CODES.has(store.errorCode)) {
        needsRequoteStoreIds.push(store.storeId);
        checkoutSessionInvalid ||= INVALID_SESSION_ERROR_CODES.has(store.errorCode);
      }
      savePendingCheckout(pending);
      void trackEvent('checkout.store_submit_failed', {
        checkoutId: pending.checkoutId,
        storeId: store.storeId,
      }, auth.accessToken);
    }
  }

  if (auth.accountId && paymentRecordedCents) {
    wallet.recordPayment(paymentRecordedCents);
    void wallet.load().catch(() => undefined);
  } else if (auth.accountId && created.length) {
    void wallet.load().catch(() => undefined);
  }
  if (!pendingCheckoutHasWork(pending)) {
    clearPendingCheckout();
    if (!blockedStoreIds.length) clearActiveCheckoutSession();
  }

  return {
    pending,
    created,
    failedStoreIds,
    blockedStoreIds,
    needsRequoteStoreIds,
    checkoutSessionInvalid,
    loginRequired: pending.stores.some((store) => (
      store.errorCode === 'LOGIN_REQUIRED' || store.errorCode === 'GUEST_CHECKOUT_LIMIT'
    )),
  };
}

export async function reconcilePendingCheckout(
  pending: PendingCheckout,
): Promise<VirtualOrder[]> {
  const orders = useOrderStore();
  const cart = useCartStore();
  try {
    await orders.load();
  } catch {
    return [];
  }
  const recovered: VirtualOrder[] = [];
  for (const store of pending.stores) {
    if (store.status === 'succeeded') continue;
    const order = orders.orders.find((candidate) => (
      candidate.checkoutId === pending.checkoutId
      && candidate.storeId === store.storeId
    ));
    if (!order) continue;
    store.status = 'succeeded';
    store.order = order;
    store.error = undefined;
    store.errorCode = undefined;
    recovered.push(order);
    cart.clear(store.storeId);
  }
  if (pendingCheckoutHasWork(pending)) savePendingCheckout(pending);
  else clearPendingCheckout();
  return recovered;
}

async function recoverStoreOrder(
  checkoutId: string,
  storeId: string,
  orders: ReturnType<typeof useOrderStore>,
): Promise<VirtualOrder | null> {
  try {
    await orders.load();
    return orders.orders.find((candidate) => (
      candidate.checkoutId === checkoutId
      && candidate.storeId === storeId
    )) ?? null;
  } catch {
    return null;
  }
}
