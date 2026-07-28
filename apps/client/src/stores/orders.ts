import { defineStore } from 'pinia';
import type { AccountSavings, VirtualOrder } from '@baichile/api-contract';
import { orderService, type AccountGameStats, type OrderPage } from '../services/orders';
import { useAuthStore } from './auth';

const emptySavings = (): AccountSavings => ({
  savedMoneyCents: 0,
  savedCaloriesKcal: 0,
  completedOrderCount: 0,
});
const emptyGameStats = (): AccountGameStats => ({
  totalOrderCount: 0,
  completedOrderCount: 0,
  failedOrderCount: 0,
  simulatedOrderAmountCents: 0,
  simulatedCaloriesKcal: 0,
});

function statsFromSavings(savings: AccountSavings): AccountGameStats {
  return {
    totalOrderCount: savings.completedOrderCount,
    completedOrderCount: savings.completedOrderCount,
    failedOrderCount: 0,
    simulatedOrderAmountCents: savings.savedMoneyCents,
    simulatedCaloriesKcal: savings.savedCaloriesKcal,
  };
}

export const useOrderStore = defineStore('orders', {
  state: () => ({
    orders: [] as VirtualOrder[],
    current: null as VirtualOrder | null,
    savings: emptySavings(),
    gameStats: emptyGameStats(),
    nextCursor: null as string | null,
    loadingMore: false,
  }),
  actions: {
    async load(options: { append?: boolean } = {}) {
      const auth = useAuthStore();
      await auth.ensureGuest();
      const service = orderService as typeof orderService & {
        page?: (cursor?: string) => Promise<OrderPage>;
      };
      const page = service.page
        ? await service.page(options.append ? this.nextCursor || '' : '')
        : { items: await orderService.list(), nextCursor: null };
      this.orders = options.append
        ? [...this.orders, ...page.items].filter(
            (order, index, values) => values.findIndex((candidate) => candidate.id === order.id) === index,
          )
        : page.items;
      this.nextCursor = page.nextCursor;
      if (options.append) return;
      if (!auth.accountId) this.gameStats = emptyGameStats();
      else {
        const service = orderService as typeof orderService & {
          gameStats?: () => Promise<AccountGameStats>;
        };
        this.gameStats = service.gameStats
          ? await service.gameStats()
          : statsFromSavings(await orderService.savings());
      }
      this.savings = {
        savedMoneyCents: this.gameStats.simulatedOrderAmountCents,
        savedCaloriesKcal: this.gameStats.simulatedCaloriesKcal,
        completedOrderCount: this.gameStats.completedOrderCount,
      };
    },
    async loadMore() {
      if (!this.nextCursor || this.loadingMore) return;
      this.loadingMore = true;
      try {
        await this.load({ append: true });
      } finally {
        this.loadingMore = false;
      }
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
