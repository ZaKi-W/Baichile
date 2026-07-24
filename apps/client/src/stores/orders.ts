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
      this.orders = await orderService.list();
      this.savings = auth.accountId ? await orderService.savings() : emptySavings();
    },
    save(order: VirtualOrder) {
      this.current = order;
      this.orders = [order, ...this.orders.filter((item) => item.id !== order.id)];
    },
    find(id: string) {
      return this.orders.find((order) => order.id === id);
    },
    async fetchDetail(id: string, options: { force?: boolean } = {}) {
      const current = this.find(id);
      if (current && !options.force) {
        this.current = current;
        return current;
      }
      const order = await orderService.detail(id);
      this.save(order);
      return order;
    },
  },
});
