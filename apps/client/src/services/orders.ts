import type { OrderQuote, QuoteRequest, VirtualOrder } from '@baichile/api-contract';
import { calculateOrderTotal } from '@baichile/domain';
import type { GeoPoint, VirtualRoute } from '@baichile/map-core';
import { catalogService } from './catalog';
import { useAuthStore } from '../stores/auth';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

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

async function localQuote(request: QuoteRequest): Promise<OrderQuote> {
  const store = await catalogService.store(request.storeId);
  const lines = request.lines.map((input) => {
    const item = store.menu.find((candidate) => candidate.id === input.menuItemId)!;
    const options = item.specGroups.flatMap((group) => group.options).filter((option) => input.optionIds.includes(option.id));
    const unitPriceCents = item.basePriceCents + options.reduce((sum, option) => sum + option.priceDeltaCents, 0);
    return {
      menuItemId: item.id, name: item.name, optionNames: options.map((option) => option.name),
      quantity: input.quantity, unitPriceCents, totalCents: unitPriceCents * input.quantity,
    };
  });
  const itemsTotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
  return {
    storeId: store.id, lines, itemsTotalCents,
    deliveryFeeCents: store.deliveryFeeCents, packingFeeCents: store.packingFeeCents,
    totalCents: calculateOrderTotal(lines.map((line) => line.totalCents), store.deliveryFeeCents, store.packingFeeCents),
  };
}

function localRoute(id: string): VirtualRoute {
  const p = (lat: number, lng: number): GeoPoint => ({ lat, lng, coordSystem: 'gcj02' });
  const polyline = [p(31.2303, 121.4737), p(31.2312, 121.4751), p(31.2325, 121.4764), p(31.2338, 121.4782)];
  return { id: `route_${id}`, cityCode: '310000', origin: polyline[0], destination: polyline[3], polyline, routeSource: 'prebuilt', label: '虚拟配送路线' };
}

export const orderService = {
  async quote(request: QuoteRequest): Promise<OrderQuote> {
    if (!API_BASE) return localQuote(request);
    return post<OrderQuote>('/v1/orders/quote', request);
  },
  async create(request: QuoteRequest): Promise<VirtualOrder> {
    const auth = useAuthStore();
    if (API_BASE) {
      return post<VirtualOrder>('/v1/orders/virtual', request, {
        Authorization: `Bearer ${auth.accessToken}`, 'x-visitor-id': auth.visitorId,
      });
    }
    const quote = await localQuote(request);
    const id = `local_${Date.now()}`;
    return {
      ...quote, id, isVirtual: true, visitorId: auth.visitorId,
      virtualDestinationId: request.virtualDestinationId, status: 'created',
      startedAt: new Date().toISOString(), durationMs: 60_000, seed: id, route: localRoute(id),
    };
  },
};
