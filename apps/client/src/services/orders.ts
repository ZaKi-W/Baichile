import type { AccountSavings, OrderQuote, QuoteRequest, VirtualOrder } from '@baichile/api-contract';
import { useAuthStore } from '../stores/auth';
import { ApiRequestError, requestApi } from './http';

export const orderService = {
  async quote(request: QuoteRequest): Promise<OrderQuote> {
    return requestApi<OrderQuote>('POST', '/v1/orders/quote', '', request);
  },
  async create(request: QuoteRequest): Promise<VirtualOrder> {
    const auth = useAuthStore();
    if (auth.accountId) return requestApi<VirtualOrder>('POST', '/v1/orders/virtual', auth.accessToken, request);
    throw new ApiRequestError('服务未配置，暂时无法创建订单');
  },
  async list(): Promise<VirtualOrder[]> {
    const auth = useAuthStore();
    if (!auth.accountId) return [];
    return requestApi<VirtualOrder[]>('GET', '/v1/orders/me', auth.accessToken);
  },
  async detail(id: string): Promise<VirtualOrder> {
    const auth = useAuthStore();
    if (!auth.accountId) throw new ApiRequestError('请先登录后查看订单');
    return requestApi<VirtualOrder>('GET', `/v1/orders/${encodeURIComponent(id)}`, auth.accessToken);
  },
  async savings(): Promise<AccountSavings> {
    const auth = useAuthStore();
    const empty = { savedMoneyCents: 0, savedCaloriesKcal: 0, completedOrderCount: 0 };
    if (!auth.accountId) return empty;
    return requestApi<AccountSavings>('GET', '/v1/accounts/me/savings', auth.accessToken);
  },
};
