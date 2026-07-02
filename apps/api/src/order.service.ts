import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { OrderQuote, QuoteRequest, VirtualOrder } from '@baichile/api-contract';
import { calculateLineTotal, calculateOrderTotal, validateSelections } from '@baichile/domain';
import type { GeoPoint, VirtualRoute } from '@baichile/map-core';
import { CatalogService } from './catalog.service';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { VirtualOrderEntity } from './database/entities/virtual-order.entity';

@Injectable()
export class OrderService {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @InjectRepository(VirtualOrderEntity) private readonly orders: Repository<VirtualOrderEntity>,
  ) {}

  async quote(request: QuoteRequest): Promise<OrderQuote> {
    if (!request.lines?.length) throw new BadRequestException('购物车不能为空');
    const store = await this.catalog.find(request.storeId);
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

  async create(request: QuoteRequest, visitorId?: string, accountId?: string): Promise<VirtualOrder> {
    const quote = await this.quote(request);
    const id = randomUUID();
    const route = this.route(id, request.virtualDestinationPoint);
    const order: VirtualOrder = {
      ...quote,
      id,
      isVirtual: true,
      visitorId: visitorId || 'anonymous',
      accountId,
      virtualDestinationId: request.virtualDestinationId,
      status: 'created',
      startedAt: new Date().toISOString(),
      durationMs: 60_000,
      seed: id.slice(0, 8),
      route,
    };
    await this.orders.save(this.orders.create({
      id: order.id,
      visitorId: visitorId ?? null,
      accountId: accountId ?? null,
      status: order.status,
      storeId: order.storeId,
      destinationId: order.virtualDestinationId,
      startedAt: new Date(order.startedAt),
      durationMs: order.durationMs,
      seed: order.seed,
      itemsTotalCents: order.itemsTotalCents,
      deliveryFeeCents: order.deliveryFeeCents,
      packingFeeCents: order.packingFeeCents,
      totalCents: order.totalCents,
      lines: order.lines,
      route: order.route,
    }));
    return order;
  }

  async find(id: string): Promise<VirtualOrder> {
    const order = await this.orders.findOneBy({ id });
    if (!order) throw new NotFoundException('订单不存在');
    return this.toOrder(order);
  }

  async list(visitorId?: string, accountId?: string) {
    if (!visitorId && !accountId) return [];
    const rows = await this.orders.find({
      where: accountId ? { accountId } : { visitorId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toOrder(row));
  }

  async merge(visitorId: string, accountId: string, manager?: EntityManager) {
    const repo = (manager ?? this.orders.manager).getRepository(VirtualOrderEntity);
    const result = await repo.update({ visitorId }, { visitorId: null, accountId });
    return { merged: result.affected ?? 0 };
  }

  private toOrder(row: VirtualOrderEntity): VirtualOrder {
    return {
      id: row.id,
      isVirtual: true,
      visitorId: row.visitorId ?? 'anonymous',
      accountId: row.accountId ?? undefined,
      storeId: row.storeId,
      virtualDestinationId: row.destinationId,
      status: row.status as VirtualOrder['status'],
      startedAt: row.startedAt.toISOString(),
      durationMs: row.durationMs,
      seed: row.seed,
      itemsTotalCents: row.itemsTotalCents,
      deliveryFeeCents: row.deliveryFeeCents,
      packingFeeCents: row.packingFeeCents,
      totalCents: row.totalCents,
      lines: row.lines as VirtualOrder['lines'],
      route: row.route as VirtualRoute,
    };
  }

  private route(id: string, requestedDestination?: GeoPoint): VirtualRoute {
    const point = (lat: number, lng: number): GeoPoint => ({ lat, lng, coordSystem: 'gcj02' });
    if (requestedDestination && requestedDestination.coordSystem !== 'gcj02') {
      throw new BadRequestException('客户端定位必须使用 GCJ-02 坐标');
    }
    const destination = requestedDestination || point(31.2338, 121.4782);

    // Generate store origin near destination (0.5–2.5 km away)
    const seed = Math.abs(id.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0));
    const angle = (seed % 360) * (Math.PI / 180);
    const dist = 0.5 + ((seed % 200) / 100); // 0.5 ~ 2.5 km
    const dLat = (dist * Math.cos(angle)) / 111;
    const dLng = (dist * Math.sin(angle)) / (111 * Math.cos(destination.lat * Math.PI / 180));
    const origin = point(destination.lat + dLat, destination.lng + dLng);

    const polyline = [
      origin,
      point(origin.lat + (destination.lat - origin.lat) * 0.34, origin.lng + (destination.lng - origin.lng) * 0.3),
      point(origin.lat + (destination.lat - origin.lat) * 0.68, origin.lng + (destination.lng - origin.lng) * 0.72),
      destination,
    ];
    return {
      id: `route_${id}`,
      cityCode: '310000',
      origin,
      destination,
      polyline,
      routeSource: 'prebuilt',
      label: '虚拟配送路线',
    };
  }
}
