import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminQueryService } from './admin-services';
import { collections } from './collections';
import { MemoryDatabase, type ListOptions } from './database';
import type { VirtualOrderDoc } from './models';
import { BaichileCloudServices } from './services';

const NOW = new Date('2026-07-28T12:00:00.000Z');

describe('admin order dynamic status', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps list and detail status exactly like the public order DTO', async () => {
    const db = new MemoryDatabase();
    const order = orderDoc({
      id: 'completed-order',
      startedAt: new Date(NOW.getTime() - 120_000).toISOString(),
      durationMs: 45_000,
    });
    await db.collection<VirtualOrderDoc>(collections.virtualOrders).insert(order);

    const admin = new AdminQueryService(db);
    const publicOrder = await new BaichileCloudServices(db).orders.find(order.id, {
      accountId: order.accountId!,
    });
    const list = await admin.listOrders({ page: '1', pageSize: '20' });
    const detail = await admin.order(order.id);

    expect(publicOrder.status).toBe('completed');
    expect(list.items).toHaveLength(1);
    expect(list.items[0].status).toBe(publicOrder.status);
    expect(detail.status).toBe(publicOrder.status);
  });

  it('derives status after an unbounded read, including matching orders after row 101', async () => {
    const reads: ListOptions[] = [];
    const db = new MemoryDatabase((collection, options) => {
      if (collection === collections.virtualOrders) reads.push(options);
    });
    const orders = db.collection<VirtualOrderDoc>(collections.virtualOrders);

    for (let index = 0; index < 101; index += 1) {
      await orders.insert(orderDoc({
        id: `future-${String(index).padStart(3, '0')}`,
        createdAt: new Date(NOW.getTime() - index).toISOString(),
        startedAt: new Date(NOW.getTime() + 60_000).toISOString(),
      }));
    }
    await orders.insert(orderDoc({
      id: 'dynamic-delivering',
      createdAt: new Date(NOW.getTime() - 10_000).toISOString(),
      startedAt: new Date(NOW.getTime() - 20_000).toISOString(),
      durationMs: 60_000,
    }));
    await orders.insert(orderDoc({
      id: 'dynamic-completed-after-101',
      createdAt: new Date(NOW.getTime() - 20_000).toISOString(),
      startedAt: new Date(NOW.getTime() - 120_000).toISOString(),
      durationMs: 45_000,
    }));

    const admin = new AdminQueryService(db);
    const completed = await admin.listOrders({ status: 'completed', page: '1', pageSize: '20' });
    const delivering = await admin.listOrders({ status: 'delivering', page: '1', pageSize: '20' });

    expect(completed).toMatchObject({
      total: 1,
      items: [{ id: 'dynamic-completed-after-101', status: 'completed' }],
    });
    expect(delivering).toMatchObject({
      total: 1,
      items: [{ id: 'dynamic-delivering', status: 'delivering' }],
    });
    expect(reads).toHaveLength(2);
    expect(reads.every((options) => options.limit === undefined && options.where === undefined)).toBe(true);
  });
});

function orderDoc(overrides: Partial<VirtualOrderDoc> & { id: string }): VirtualOrderDoc {
  const { id, ...patch } = overrides;
  const createdAt = patch.createdAt ?? NOW.toISOString();
  return {
    _id: id,
    id,
    accountId: 'account-1',
    visitorId: null,
    status: 'created',
    storeId: 'store-1',
    storeName: '测试小馆',
    destinationId: 'destination-1',
    startedAt: NOW.toISOString(),
    durationMs: 60_000,
    seed: id,
    itemsTotalCents: 1_000,
    deliveryFeeCents: 0,
    packingFeeCents: 0,
    totalCents: 1_000,
    itemsTotalCaloriesKcal: 500,
    lines: [],
    route: {},
    adminStatus: 'normal',
    adminNote: '',
    createdAt,
    updatedAt: createdAt,
    ...patch,
  };
}
