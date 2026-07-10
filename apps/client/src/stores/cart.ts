import { defineStore } from 'pinia';
import type { MenuItem, StoreDetail } from '@baichile/api-contract';
import { calculateLineTotal } from '@baichile/domain';

export interface CartLine {
  key: string;
  storeId: string;
  item: MenuItem;
  optionIds: string[];
  optionNames: string[];
  quantity: number;
  totalCents: number;
}

export interface CartStoreGroup {
  store: StoreDetail;
  lines: CartLine[];
  count: number;
  itemsTotalCents: number;
  totalCents: number;
}

const lineTotal = (line: CartLine) => {
  const options = line.item.specGroups
    .flatMap((group) => group.options)
    .filter((option) => line.optionIds.includes(option.id));
  return calculateLineTotal(line.item.basePriceCents, options.map((option) => option.priceDeltaCents), line.quantity);
};

const makeGroup = (store: StoreDetail, lines: CartLine[]): CartStoreGroup => {
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const itemsTotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
  return {
    store,
    lines,
    count,
    itemsTotalCents,
    totalCents: itemsTotalCents + store.deliveryFeeCents + store.packingFeeCents,
  };
};

export const useCartStore = defineStore('cart', {
  state: () => ({
    activeStoreId: '',
    stores: {} as Record<string, StoreDetail>,
    linesByStore: {} as Record<string, CartLine[]>,
  }),
  getters: {
    groups: (state): CartStoreGroup[] => Object.values(state.stores)
      .map((store) => makeGroup(store, state.linesByStore[store.id] ?? []))
      .filter((group) => group.lines.length > 0),
    store: (state) => state.stores[state.activeStoreId] ?? null,
    lines: (state) => state.linesByStore[state.activeStoreId] ?? [],
    count(): number {
      return this.lines.reduce((sum, line) => sum + line.quantity, 0);
    },
    allCount(): number {
      return this.groups.reduce((sum, group) => sum + group.count, 0);
    },
    itemsTotalCents(): number {
      return this.lines.reduce((sum, line) => sum + line.totalCents, 0);
    },
    allItemsTotalCents(): number {
      return this.groups.reduce((sum, group) => sum + group.itemsTotalCents, 0);
    },
    totalCents(): number {
      if (!this.store) return 0;
      return this.itemsTotalCents + this.store.deliveryFeeCents + this.store.packingFeeCents;
    },
    allTotalCents(): number {
      return this.groups.reduce((sum, group) => sum + group.totalCents, 0);
    },
  },
  actions: {
    selectStore(store: StoreDetail) {
      this.stores[store.id] = store;
      this.activeStoreId = store.id;
      if (!this.linesByStore[store.id]) this.linesByStore[store.id] = [];
    },
    async add(store: StoreDetail, item: MenuItem, optionIds: string[], quantity: number): Promise<boolean> {
      this.selectStore(store);
      const allOptions = item.specGroups.flatMap((group) => group.options);
      const options = allOptions.filter((option) => optionIds.includes(option.id));
      const key = `${store.id}:${item.id}:${[...optionIds].sort().join(',')}`;
      const lines = this.linesByStore[store.id] ?? [];
      const existing = lines.find((line) => line.key === key);
      if (existing) {
        existing.quantity += quantity;
        existing.totalCents = lineTotal(existing);
      } else {
        lines.push({
          key, storeId: store.id, item, optionIds, optionNames: options.map((option) => option.name), quantity,
          totalCents: calculateLineTotal(item.basePriceCents, options.map((option) => option.priceDeltaCents), quantity),
        });
      }
      this.linesByStore[store.id] = lines;
      return true;
    },
    remove(key: string) {
      for (const [storeId, lines] of Object.entries(this.linesByStore)) {
        const next = lines.filter((line) => line.key !== key);
        if (next.length === lines.length) continue;
        this.linesByStore[storeId] = next;
        if (!next.length) delete this.linesByStore[storeId];
        return;
      }
    },
    updateQuantity(key: string, quantity: number) {
      const storeId = this.storeIdForLine(key);
      if (!storeId) return;
      const line = this.linesByStore[storeId]?.find((item) => item.key === key);
      if (!line) return;
      if (quantity <= 0) {
        this.remove(key);
        return;
      }
      line.quantity = quantity;
      line.totalCents = lineTotal(line);
    },
    clear(storeId?: string) {
      if (storeId) {
        delete this.linesByStore[storeId];
        if (this.activeStoreId === storeId && !this.lines.length) this.activeStoreId = Object.keys(this.linesByStore)[0] ?? '';
        return;
      }
      this.activeStoreId = '';
      this.stores = {};
      this.linesByStore = {};
    },
    storeIdForLine(key: string): string {
      return Object.entries(this.linesByStore).find(([, lines]) => lines.some((line) => line.key === key))?.[0] ?? '';
    },
    group(storeId: string): CartStoreGroup | null {
      const store = this.stores[storeId];
      const lines = this.linesByStore[storeId] ?? [];
      return store && lines.length ? makeGroup(store, lines) : null;
    },
  },
});
