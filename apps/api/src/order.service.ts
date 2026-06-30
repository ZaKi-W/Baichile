import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { OrderQuote, QuoteRequest, VirtualOrder } from '@baichile/api-contract';
import { calculateLineTotal, calculateOrderTotal, validateSelections } from '@baichile/domain';
import type { GeoPoint, VirtualRoute } from '@baichile/map-core';
import { CatalogService } from './catalog.service';

@Injectable()
export class OrderService {
  private readonly orders = new Map<string, VirtualOrder>();

  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  quote(request: QuoteRequest): OrderQuote {
    if (!request.lines?.length) throw new BadRequestException('购物车不能为空');
    const store = this.catalog.find(request.storeId);
    const lines = request.lines.map((input) => {
      const item = store.menu.find((menuItem) => menuItem.id === input.menuItemId);
      if (!item) throw new BadRequestException('菜品不存在或不属于该店铺');
      const validation = validateSelections(item.specGroups, input.optionIds);
      if (!validation.valid) throw new BadRequestException(validation.message);
      const options = item.specGroups.flatMap((group) => group.options)
        .filter((option) => input.optionIds.includes(option.id));
      const unitPriceCents = item.basePriceCents + options.reduce((sum, option) => sum + option.priceDeltaCents, 0);
      return {
        menuItemId: item.id,
        name: item.name,
        optionNames: options.map((option) => option.name),
        quantity: input.quantity,
        unitPriceCents,
        totalCents: calculateLineTotal(item.basePriceCents, options.map((option) => option.priceDeltaCents), input.quantity),
      };
    });
    const itemsTotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
    return {
      storeId: store.id,
      lines,
      itemsTotalCents,
      deliveryFeeCents: store.deliveryFeeCents,
      packingFeeCents: store.packingFeeCents,
      totalCents: calculateOrderTotal(lines.map((line) => line.totalCents), store.deliveryFeeCents, store.packingFeeCents),
    };
  }

  create(request: QuoteRequest, visitorId?: string): VirtualOrder {
    const quote = this.quote(request);
    const id = randomUUID();
    const route = this.route(id);
    const order: VirtualOrder = {
      ...quote,
      id,
      isVirtual: true,
      visitorId: visitorId || 'anonymous',
      virtualDestinationId: request.virtualDestinationId,
      status: 'created',
      startedAt: new Date().toISOString(),
      durationMs: 60_000,
      seed: id.slice(0, 8),
      route,
    };
    this.orders.set(order.id, order);
    return order;
  }

  find(id: string): VirtualOrder {
    const order = this.orders.get(id);
    if (!order) throw new NotFoundException('订单不存在');
    return order;
  }

  list(visitorId?: string, accountId?: string) {
    return [...this.orders.values()].filter((order) =>
      (visitorId && order.visitorId === visitorId) || (accountId && order.accountId === accountId));
  }

  merge(visitorId: string, accountId: string) {
    let merged = 0;
    for (const order of this.orders.values()) {
      if (order.visitorId === visitorId) {
        order.accountId = accountId;
        merged += 1;
      }
    }
    return { merged };
  }

  private route(id: string): VirtualRoute {
    const point = (lat: number, lng: number): GeoPoint => ({ lat, lng, coordSystem: 'gcj02' });
    const polyline = [
      point(31.2303, 121.4737),
      point(31.2312, 121.4751),
      point(31.2325, 121.4764),
      point(31.2338, 121.4782),
    ];
    return {
      id: `route_${id}`,
      cityCode: '310000',
      origin: polyline[0],
      destination: polyline.at(-1)!,
      polyline,
      routeSource: 'prebuilt',
      label: '虚拟配送路线',
    };
  }
}
