import type { OrderQuote, QuoteRequest, VirtualOrder } from '@baichile/api-contract';
import { calculateOrderTotal } from '@baichile/domain';
import type { GeoPoint, VirtualRoute } from '@baichile/map-core';
import { catalogService } from './catalog';
import { useAuthStore } from '../stores/auth';
import { API_BASE } from '../config/api';

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

function localRoute(id: string, destinationPoint?: GeoPoint): VirtualRoute {
  const p = (lat: number, lng: number): GeoPoint => ({ lat, lng, coordSystem: 'gcj02' });
  const destination = destinationPoint || p(31.2338, 121.4782);

  // Generate store origin near destination (0.5–2.5 km away)
  const seed = Math.abs(id.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0));
  const angle = (seed % 360) * (Math.PI / 180);
  const dist = 0.5 + ((seed % 200) / 100); // 0.5 ~ 2.5 km
  const dLat = (dist * Math.cos(angle)) / 111;
  const dLng = (dist * Math.sin(angle)) / (111 * Math.cos(destination.lat * Math.PI / 180));
  const origin = p(destination.lat + dLat, destination.lng + dLng);

  const polyline = [
    origin,
    p(origin.lat + (destination.lat - origin.lat) * 0.34, origin.lng + (destination.lng - origin.lng) * 0.3),
    p(origin.lat + (destination.lat - origin.lat) * 0.68, origin.lng + (destination.lng - origin.lng) * 0.72),
    destination,
  ];
  return { id: `route_${id}`, cityCode: '310000', origin, destination, polyline, routeSource: 'generated', label: '虚拟配送路线' };
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
        Authorization: `Bearer ${auth.accessToken}`,
      });
    }
    const quote = await localQuote(request);
    const store = await catalogService.store(request.storeId);
    const id = `local_${Date.now()}`;
    return {
      ...quote, id, isVirtual: true, visitorId: auth.visitorId,
      virtualDestinationId: request.virtualDestinationId, status: 'created',
      accountId: auth.accountId || undefined,
      startedAt: new Date().toISOString(), durationMs: store.virtualDeliveryMinutes * 60_000,
      seed: id, route: localRoute(id, request.virtualDestinationPoint),
    };
  },
  async list(): Promise<VirtualOrder[]> {
    const auth = useAuthStore();
    if (!auth.accountId) return [];
    if (!API_BASE) {
      return (uni.getStorageSync(`baichile:orders:${auth.accountId}`) || []) as VirtualOrder[];
    }
    return get<VirtualOrder[]>('/v1/orders/me', {
      Authorization: `Bearer ${auth.accessToken}`,
    });
  },
};
