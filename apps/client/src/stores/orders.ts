import { defineStore } from 'pinia';
import type { AccountSavings, VirtualOrder } from '@baichile/api-contract';
import { orderService } from '../services/orders';
import { useAuthStore } from './auth';

const emptySavings = (): AccountSavings => ({
  savedMoneyCents: 0,
  savedCaloriesKcal: 0,
  completedOrderCount: 0,
});

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
      [this.orders, this.savings] = await Promise.all([
        orderService.list(),
        orderService.savings(),
      ]);
    },
    save(order: VirtualOrder) {
      this.current = order;
      this.orders = [order, ...this.orders.filter((item) => item.id !== order.id)];
    },
    find(id: string) {
      return this.orders.find((order) => order.id === id);
    },
  },
});
