import { defineStore } from 'pinia';
import type { AccountSavings, VirtualOrder } from '@baichile/api-contract';
import { orderService } from '../services/orders';
import { useAuthStore } from './auth';
import { getDeliveryIncidentPhase } from '@baichile/domain';

const orderKey = (ownerId: string) => `baichile:orders:${ownerId}`;
const emptySavings = (): AccountSavings => ({
  savedMoneyCents: 0,
  savedCaloriesKcal: 0,
  completedOrderCount: 0,
});

function savingsFromOrders(orders: VirtualOrder[], now = Date.now()): AccountSavings {
  return orders.reduce<AccountSavings>((summary, order) => {
    if (order.incident && getDeliveryIncidentPhase(order.incident, now) === 'failed') return summary;
    const completed = now - new Date(order.startedAt).getTime() >= 83_000 + order.durationMs;
    if (!completed) return summary;
    summary.savedMoneyCents += order.totalCents;
    summary.savedCaloriesKcal += order.itemsTotalCaloriesKcal || 0;
    summary.completedOrderCount += 1;
    return summary;
  }, emptySavings());
}

export const useOrderStore = defineStore('orders', {
  state: () => ({
    orders: [] as VirtualOrder[],
    current: null as VirtualOrder | null,
    savings: emptySavings(),
  }),
  actions: {
    async load() {
      const auth = useAuthStore();
      await auth.ensureGuest();
      if (!auth.accountId) {
        this.orders = [];
        this.current = null;
        this.savings = emptySavings();
        return;
      }
      try {
        [this.orders, this.savings] = await Promise.all([
          orderService.list(),
          orderService.savings(),
        ]);
        uni.setStorageSync(orderKey(auth.accountId), this.orders);
      } catch {
        this.orders = (uni.getStorageSync(orderKey(auth.accountId)) || []) as VirtualOrder[];
        this.savings = savingsFromOrders(this.orders);
      }
    },
    save(order: VirtualOrder) {
      const auth = useAuthStore();
      this.current = order;
      this.orders = [order, ...this.orders.filter((item) => item.id !== order.id)];
      const ownerId = auth.accountId || auth.visitorId;
      if (ownerId) uni.setStorageSync(orderKey(ownerId), this.orders);
    },
    find(id: string) {
      return this.orders.find((order) => order.id === id);
    },
  },
});
