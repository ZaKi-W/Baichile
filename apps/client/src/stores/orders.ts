import { defineStore } from 'pinia';
import type { VirtualOrder } from '@baichile/api-contract';

const ORDER_KEY = 'baichile:orders';

export const useOrderStore = defineStore('orders', {
  state: () => ({
    orders: (uni.getStorageSync(ORDER_KEY) || []) as VirtualOrder[],
    current: null as VirtualOrder | null,
  }),
  actions: {
    save(order: VirtualOrder) {
      this.current = order;
      this.orders = [order, ...this.orders.filter((item) => item.id !== order.id)];
      uni.setStorageSync(ORDER_KEY, this.orders);
    },
    find(id: string) {
      return this.orders.find((order) => order.id === id);
    },
  },
});

