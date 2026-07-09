import type { AccountSavings, OrderQuote, QuoteRequest, VirtualOrder } from '@baichile/api-contract';
import { calculateLineCalories, calculateOrderTotal } from '@baichile/domain';
import { catalogService } from './catalog';
import { useAuthStore } from '../stores/auth';
import { API_BASE, USE_CLOUDBASE_API } from '../config/api';
import { ApiRequestError, requestApi } from './http';
import { getDeliveryIncidentPhase } from '@baichile/domain';

function post<T>(path: string, data: unknown, headers: Record<string, string> = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    uni.request({
      method: 'POST',
      url: `${API_BASE}${path}`,
      data: data as UniApp.RequestOptions['data'],
      header: headers,
      success: (response) => response.statusCode < 400 ? resolve(response.data as T) : reject(new Error('接口请求失败')),
      fail: reject,
    });
  });
}

function get<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    uni.request({
      url: `${API_BASE}${path}`,
      header: headers,
      success: (response) => response.statusCode < 400 ? resolve(response.data as T) : reject(new Error('接口请求失败')),
      fail: reject,
    });
  });
}

async function localQuote(request: QuoteRequest): Promise<OrderQuote> {
  const store = await catalogService.store(request.storeId);
  const lines = request.lines.map((input) => {
    const item = store.menu.find((candidate) => candidate.id === input.menuItemId)!;
    const options = item.specGroups.flatMap((group) => group.options).filter((option) => input.optionIds.includes(option.id));
    const unitPriceCents = item.basePriceCents + options.reduce((sum, option) => sum + option.priceDeltaCents, 0);
    const unitCaloriesKcal = calculateLineCalories(
      item.caloriesKcal,
      options.map((option) => option.calorieDeltaKcal),
      1,
    );
    return {
      menuItemId: item.id, name: item.name, optionNames: options.map((option) => option.name),
      quantity: input.quantity, unitPriceCents, totalCents: unitPriceCents * input.quantity,
      unitCaloriesKcal, totalCaloriesKcal: unitCaloriesKcal * input.quantity,
    };
  });
  const itemsTotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
  const itemsTotalCaloriesKcal = lines.reduce((sum, line) => sum + line.totalCaloriesKcal, 0);
  return {
    storeId: store.id, lines, itemsTotalCents,
    deliveryFeeCents: store.deliveryFeeCents, packingFeeCents: store.packingFeeCents,
    totalCents: calculateOrderTotal(lines.map((line) => line.totalCents), store.deliveryFeeCents, store.packingFeeCents),
    itemsTotalCaloriesKcal,
  };
}

export const orderService = {
  async quote(request: QuoteRequest): Promise<OrderQuote> {
    if (USE_CLOUDBASE_API) return requestApi<OrderQuote>('POST', '/v1/orders/quote', '', request);
    if (!API_BASE) return localQuote(request);
    return post<OrderQuote>('/v1/orders/quote', request);
  },
  async create(request: QuoteRequest): Promise<VirtualOrder> {
    const auth = useAuthStore();
    if (API_BASE || USE_CLOUDBASE_API) {
      return requestApi<VirtualOrder>('POST', '/v1/orders/virtual', auth.accessToken, request);
    }
    throw new ApiRequestError('服务未配置，暂时无法创建订单');
  },
  async list(): Promise<VirtualOrder[]> {
    const auth = useAuthStore();
    if (!auth.accountId) return [];
    if (USE_CLOUDBASE_API) {
      return requestApi<VirtualOrder[]>('GET', '/v1/orders/me', auth.accessToken);
    }
    if (!API_BASE) {
      return (uni.getStorageSync(`baichile:orders:${auth.accountId}`) || []) as VirtualOrder[];
    }
    return get<VirtualOrder[]>('/v1/orders/me', {
      Authorization: `Bearer ${auth.accessToken}`,
    });
  },
  async savings(): Promise<AccountSavings> {
    const auth = useAuthStore();
    const empty = { savedMoneyCents: 0, savedCaloriesKcal: 0, completedOrderCount: 0 };
    if (!auth.accountId) return empty;
    if (USE_CLOUDBASE_API) {
      return requestApi<AccountSavings>('GET', '/v1/accounts/me/savings', auth.accessToken);
    }
    if (API_BASE) {
      return get<AccountSavings>('/v1/accounts/me/savings', {
        Authorization: `Bearer ${auth.accessToken}`,
      });
    }
    const orders = (uni.getStorageSync(`baichile:orders:${auth.accountId}`) || []) as VirtualOrder[];
    return orders.reduce<AccountSavings>((summary, order) => {
      if (order.incident && getDeliveryIncidentPhase(order.incident) === 'failed') return summary;
      const completed = Date.now() - new Date(order.startedAt).getTime() >= 83_000 + order.durationMs;
      if (!completed) return summary;
      summary.savedMoneyCents += order.totalCents;
      summary.savedCaloriesKcal += order.itemsTotalCaloriesKcal;
      summary.completedOrderCount += 1;
      return summary;
    }, empty);
  },
};
