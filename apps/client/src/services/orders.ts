import type {
  AccountGameStats,
  AccountSavings,
  OrderQuote,
  QuoteRequest,
  VirtualOrder,
} from '@baichile/api-contract';
import { useAuthStore } from '../stores/auth';
import { ApiRequestError, requestApi } from './http';

export type { AccountGameStats };

export interface OrderPage {
  items: VirtualOrder[];
  nextCursor: string | null;
}

function normalizeOrderPage(value: VirtualOrder[] | OrderPage): OrderPage {
  return Array.isArray(value)
    ? { items: value, nextCursor: null }
    : {
        items: Array.isArray(value.items) ? value.items : [],
        nextCursor: typeof value.nextCursor === 'string' && value.nextCursor ? value.nextCursor : null,
      };
}

export const orderService = {
  async quote(request: QuoteRequest): Promise<OrderQuote> {
    return requestApi<OrderQuote>('POST', '/v1/orders/quote', '', request);
  },
  async create(request: QuoteRequest): Promise<VirtualOrder> {
    const auth = useAuthStore();
    await auth.ensureGuest();
    return requestApi<VirtualOrder>('POST', '/v1/orders/virtual', auth.accessToken, request);
  },
  async page(cursor = ''): Promise<OrderPage> {
    const auth = useAuthStore();
    await auth.ensureGuest();
    const path = `/v1/orders/me?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const value = await requestApi<VirtualOrder[] | OrderPage>('GET', path, auth.accessToken);
    return normalizeOrderPage(value);
  },
  async list(): Promise<VirtualOrder[]> {
    return (await this.page()).items;
  },
  async detail(id: string): Promise<VirtualOrder> {
    const auth = useAuthStore();
    await auth.ensureGuest();
    return requestApi<VirtualOrder>('GET', `/v1/orders/${encodeURIComponent(id)}`, auth.accessToken);
  },
  async savings(): Promise<AccountSavings> {
    const auth = useAuthStore();
    const empty = { savedMoneyCents: 0, savedCaloriesKcal: 0, completedOrderCount: 0 };
    if (!auth.accountId) return empty;
    return requestApi<AccountSavings>('GET', '/v1/accounts/me/savings', auth.accessToken);
  },
  async gameStats(): Promise<AccountGameStats> {
    const auth = useAuthStore();
    const empty: AccountGameStats = {
      totalOrderCount: 0,
      completedOrderCount: 0,
      failedOrderCount: 0,
      simulatedOrderAmountCents: 0,
      simulatedCaloriesKcal: 0,
    };
    if (!auth.accountId) return empty;
    try {
      return await requestApi<AccountGameStats>('GET', '/v1/accounts/me/game-stats', auth.accessToken);
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.code !== 'NOT_FOUND') throw error;
      const legacy = await this.savings();
      return {
        totalOrderCount: legacy.completedOrderCount,
        completedOrderCount: legacy.completedOrderCount,
        failedOrderCount: 0,
        simulatedOrderAmountCents: legacy.savedMoneyCents,
        simulatedCaloriesKcal: legacy.savedCaloriesKcal,
      };
    }
  },
};
