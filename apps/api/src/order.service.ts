import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AccountSavings, OrderQuote, QuoteRequest, VirtualOrder } from '@baichile/api-contract';
import type { DeliveryIncidentKey } from '@baichile/domain';
import {
  calculateLineCalories,
  calculateLineTotal,
  calculateOrderTotal,
  validateSelections,
  getDeliveryIncidentPhase,
  selectDeliveryIncident,
} from '@baichile/domain';
import type { DeliveryStatus, GeoPoint, VirtualRoute } from '@baichile/map-core';
import { CatalogService } from './catalog.service';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { VirtualOrderEntity } from './database/entities/virtual-order.entity';
import { WalletService } from './wallet.service';
import { WalletTransactionEntity } from './database/entities/wallet-transaction.entity';
import { AccountEntity } from './database/entities/account.entity';

export function summarizeCompletedOrders(
  orders: Array<{
    completed: boolean;
    totalCents: number;
    itemsTotalCaloriesKcal: number;
  }>,
): AccountSavings {
  return orders.reduce<AccountSavings>((summary, order) => {
    if (!order.completed) return summary;
    summary.savedMoneyCents += order.totalCents;
    summary.savedCaloriesKcal += order.itemsTotalCaloriesKcal;
    summary.completedOrderCount += 1;
    return summary;
  }, { savedMoneyCents: 0, savedCaloriesKcal: 0, completedOrderCount: 0 });
}

@Injectable()
export class OrderService {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @InjectRepository(VirtualOrderEntity) private readonly orders: Repository<VirtualOrderEntity>,
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(WalletService) private readonly wallet: WalletService,
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
      const unitCaloriesKcal = calculateLineCalories(
        item.caloriesKcal,
        options.map((option) => option.calorieDeltaKcal),
        1,
      );
      return {
        menuItemId: item.id,
        name: item.name,
        optionNames: options.map((option) => option.name),
        quantity: input.quantity,
        unitPriceCents,
        totalCents: calculateLineTotal(item.basePriceCents, options.map((option) => option.priceDeltaCents), input.quantity),
        unitCaloriesKcal,
        totalCaloriesKcal: unitCaloriesKcal * input.quantity,
      };
    });
    const itemsTotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
    const itemsTotalCaloriesKcal = lines.reduce((sum, line) => sum + line.totalCaloriesKcal, 0);
    return {
      storeId: store.id,
      lines,
      itemsTotalCents,
      deliveryFeeCents: store.deliveryFeeCents,
      packingFeeCents: store.packingFeeCents,
      totalCents: calculateOrderTotal(lines.map((line) => line.totalCents), store.deliveryFeeCents, store.packingFeeCents),
      itemsTotalCaloriesKcal,
    };
  }

  async create(request: QuoteRequest, accountId: string): Promise<VirtualOrder> {
    await this.wallet.initializeAccount(accountId);
    const quote = await this.quote(request);
    const store = await this.catalog.find(request.storeId);
    const id = randomUUID();
    const startedAt = new Date();
    const incident = selectDeliveryIncident(id.slice(0, 8), store.virtualDeliveryMinutes, startedAt.getTime());
    const route = this.route(id, request.virtualDestinationPoint);
    const order: VirtualOrder = {
      ...quote,
      id,
      isVirtual: true,
      accountId,
      virtualDestinationId: request.virtualDestinationId,
      status: 'created',
      startedAt: startedAt.toISOString(),
      durationMs: store.virtualDeliveryMinutes * 60_000,
      seed: id.slice(0, 8),
      route,
      incident,
      failedAt: incident?.failedAt,
      refundStatus: incident ? 'pending' : undefined,
    };
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(VirtualOrderEntity).save(manager.getRepository(VirtualOrderEntity).create({
        id: order.id,
        visitorId: null,
        accountId,
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
        itemsTotalCaloriesKcal: order.itemsTotalCaloriesKcal,
        lines: order.lines,
        route: order.route,
        incidentKey: incident?.key ?? null,
        incidentStartedAt: incident ? new Date(incident.startedAt) : null,
        failedAt: incident ? new Date(incident.failedAt) : null,
        refundedAt: null,
      }));
      await this.wallet.debitOrder(manager, accountId, order.totalCents, order.id);
    });
    return order;
  }

  async find(id: string): Promise<VirtualOrder> {
    await this.settleFailedOrders(undefined, id);
    const order = await this.orders.findOneBy({ id });
    if (!order) throw new NotFoundException('订单不存在');
    return this.toOrder(order);
  }

  async list(visitorId?: string, accountId?: string) {
    if (!visitorId && !accountId) return [];
    await this.settleFailedOrders(accountId);
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

  async savings(accountId?: string): Promise<AccountSavings> {
    if (!accountId) {
      return { savedMoneyCents: 0, savedCaloriesKcal: 0, completedOrderCount: 0 };
    }
    await this.settleFailedOrders(accountId);
    const rows = await this.orders.findBy({ accountId });
    return summarizeCompletedOrders(rows.map((row) => ({
      completed: this.currentStatus(row) === 'completed',
      totalCents: row.totalCents,
      itemsTotalCaloriesKcal: row.itemsTotalCaloriesKcal,
    })));
  }

  private toOrder(row: VirtualOrderEntity): VirtualOrder {
    const incident = row.incidentKey && row.incidentStartedAt && row.failedAt ? {
      key: row.incidentKey as DeliveryIncidentKey,
      startedAt: row.incidentStartedAt.toISOString(),
      failedAt: row.failedAt.toISOString(),
    } : undefined;
    return {
      id: row.id,
      isVirtual: true,
      visitorId: row.visitorId ?? 'anonymous',
      accountId: row.accountId ?? undefined,
      storeId: row.storeId,
      virtualDestinationId: row.destinationId,
      status: this.currentStatus(row),
      startedAt: row.startedAt.toISOString(),
      durationMs: row.durationMs,
      seed: row.seed,
      itemsTotalCents: row.itemsTotalCents,
      deliveryFeeCents: row.deliveryFeeCents,
      packingFeeCents: row.packingFeeCents,
      totalCents: row.totalCents,
      itemsTotalCaloriesKcal: row.itemsTotalCaloriesKcal,
      lines: row.lines as VirtualOrder['lines'],
      route: row.route as VirtualRoute,
      incident,
      failedAt: row.failedAt?.toISOString(),
      refundStatus: incident ? (row.refundedAt ? 'refunded' : 'pending') : undefined,
    };
  }

  private currentStatus(row: VirtualOrderEntity): DeliveryStatus {
    if (row.incidentKey && row.incidentStartedAt && row.failedAt) {
      const phase = getDeliveryIncidentPhase({
        key: row.incidentKey as DeliveryIncidentKey,
        startedAt: row.incidentStartedAt.toISOString(),
        failedAt: row.failedAt.toISOString(),
      });
      if (phase === 'incident' || phase === 'failed') return phase;
    }
    const elapsed = Date.now() - row.startedAt.getTime();
    if (elapsed >= 83_000 + row.durationMs) return 'completed';
    if (elapsed >= 83_000) return 'delivering';
    if (elapsed >= 78_000) return 'picked_up';
    if (elapsed >= 18_000) return 'rider_assigned';
    if (elapsed >= 8_000) return 'preparing';
    if (elapsed >= 3_000) return 'merchant_accepted';
    return 'created';
  }

  async settleFailedOrders(accountId?: string, orderId?: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const query = manager.getRepository(VirtualOrderEntity)
        .createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.failed_at IS NOT NULL')
        .andWhere('order.failed_at <= :now', { now: new Date() })
        .andWhere('order.refunded_at IS NULL');
      if (accountId) query.andWhere('order.account_id = :accountId', { accountId });
      if (orderId) query.andWhere('order.id = :orderId', { orderId });
      const failedOrders = await query.getMany();

      for (const order of failedOrders) {
        if (!order.accountId) continue;
        const account = await manager.getRepository(AccountEntity).createQueryBuilder('account')
          .setLock('pessimistic_write')
          .where('account.id = :accountId', { accountId: order.accountId })
          .getOne();
        if (!account) continue;
        account.balanceCents += order.totalCents;
        await manager.save(account);
        await manager.getRepository(WalletTransactionEntity).insert({
          id: randomUUID(),
          accountId: order.accountId,
          type: 'order_refund',
          amountCents: order.totalCents,
          balanceAfterCents: account.balanceCents,
          orderId: order.id,
          description: '配送失败退款',
          businessDate: null,
        });
        order.status = 'failed';
        order.refundedAt = new Date();
        await manager.save(order);
      }
    });
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
