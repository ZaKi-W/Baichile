import { defineStore } from 'pinia';
import type { MenuItem, StoreDetail } from '@baichile/api-contract';
import { calculateLineTotal } from '@baichile/domain';

export interface CartLine {
  key: string;
  item: MenuItem;
  optionIds: string[];
  optionNames: string[];
  quantity: number;
  totalCents: number;
}

export const useCartStore = defineStore('cart', {
  state: () => ({
    store: null as StoreDetail | null,
    lines: [] as CartLine[],
  }),
  getters: {
    count: (state) => state.lines.reduce((sum, line) => sum + line.quantity, 0),
    itemsTotalCents: (state) => state.lines.reduce((sum, line) => sum + line.totalCents, 0),
    totalCents(): number {
      if (!this.store) return 0;
      return this.itemsTotalCents + this.store.deliveryFeeCents + this.store.packingFeeCents;
    },
  },
  actions: {
    async add(store: StoreDetail, item: MenuItem, optionIds: string[], quantity: number): Promise<boolean> {
      if (this.store && this.store.id !== store.id) {
        const confirmed = await new Promise<boolean>((resolve) => {
          uni.showModal({
            title: '切换店铺',
            content: '购物车只能保留一家店的商品，是否清空后继续？',
            success: ({ confirm }) => resolve(confirm),
            fail: () => resolve(false),
          });
        });
        if (!confirmed) return false;
        this.clear();
      }
      this.store = store;
      const allOptions = item.specGroups.flatMap((group) => group.options);
      const options = allOptions.filter((option) => optionIds.includes(option.id));
      const key = `${item.id}:${[...optionIds].sort().join(',')}`;
      const existing = this.lines.find((line) => line.key === key);
      if (existing) {
        existing.quantity += quantity;
        existing.totalCents = calculateLineTotal(item.basePriceCents, options.map((option) => option.priceDeltaCents), existing.quantity);
      } else {
        this.lines.push({
          key, item, optionIds, optionNames: options.map((option) => option.name), quantity,
          totalCents: calculateLineTotal(item.basePriceCents, options.map((option) => option.priceDeltaCents), quantity),
        });
      }
      return true;
    },
    remove(key: string) {
      this.lines = this.lines.filter((line) => line.key !== key);
      if (!this.lines.length) this.store = null;
    },
    clear() {
      this.store = null;
      this.lines = [];
    },
  },
});

