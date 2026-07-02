import { defineStore } from 'pinia';
import type { VirtualOrder } from '@baichile/api-contract';
import { orderService } from '../services/orders';
import { useAuthStore } from './auth';

const orderKey = (ownerId: string) => `baichile:orders:${ownerId}`;

export const useOrderStore = defineStore('orders', {
  state: () => ({
    orders: [] as VirtualOrder[],
    current: null as VirtualOrder | null,
  }),
  actions: {
    async load() {
      const auth = useAuthStore();
      await auth.ensureGuest();
      if (!auth.accountId) {
        this.orders = [];
        this.current = null;
        return;
      }
      try {
        this.orders = await orderService.list();
        uni.setStorageSync(orderKey(auth.accountId), this.orders);
      } catch {
        this.orders = (uni.getStorageSync(orderKey(auth.accountId)) || []) as VirtualOrder[];
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
