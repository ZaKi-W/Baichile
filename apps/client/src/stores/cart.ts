import { defineStore } from 'pinia';
import type {
  MenuItem,
  PromotionThresholdTier,
  StoreDetail,
} from '@baichile/api-contract';
import { calculateLineTotal, MAX_ORDER_QUANTITY } from '@baichile/domain';

export const MAX_CART_QUANTITY = MAX_ORDER_QUANTITY;
const CART_STORAGE_KEY = 'baichile:cart:v2';

export interface CartItemSnapshot {
  id: string;
  name: string;
  imageUrl?: string;
  basePriceCents: number;
}

export interface CartStoreSnapshot {
  id: string;
  name: string;
  coverUrl?: string;
  deliveryFeeCents: number;
  packingFeeCents: number;
  minimumOrderCents: number;
  virtualDeliveryMinutes: number;
  distanceKm: number;
  flashSaleItems?: Array<{
    promotionId: string;
    menuItemId: string;
    flashPriceCents: number;
    endsAt: string;
  }>;
  storePromotion?: {
    promotionId: string;
    tiers: PromotionThresholdTier[];
    endsAt: string;
  };
}

export interface CartLine {
  key: string;
  storeId: string;
  item: CartItemSnapshot;
  optionIds: string[];
  optionNames: string[];
  quantity: number;
  optionPriceDeltaCents?: number;
  unitPriceCents: number;
  totalCents: number;
  promotionId?: string;
  promotionEndsAt?: string;
}

export interface CartStoreGroup {
  store: CartStoreSnapshot;
  lines: CartLine[];
  count: number;
  originalItemsTotalCents: number;
  itemsTotalCents: number;
  storeDiscountCents: number;
  totalCents: number;
}

interface PersistedCart {
  version: 2;
  activeStoreId: string;
  stores: Record<string, CartStoreSnapshot>;
  linesByStore: Record<string, CartLine[]>;
}

function canUseStorage(): boolean {
  return typeof uni !== 'undefined'
    && typeof uni.getStorageSync === 'function'
    && typeof uni.setStorageSync === 'function';
}

function emptyState() {
  return {
    activeStoreId: '',
    stores: {} as Record<string, CartStoreSnapshot>,
    linesByStore: {} as Record<string, CartLine[]>,
  };
}

function readState(): ReturnType<typeof emptyState> {
  if (!canUseStorage()) return emptyState();
  const value = uni.getStorageSync(CART_STORAGE_KEY) as Partial<PersistedCart> | '';
  if (!value || value.version !== 2 || !value.stores || !value.linesByStore) return emptyState();
  return {
    activeStoreId: typeof value.activeStoreId === 'string' ? value.activeStoreId : '',
    stores: value.stores,
    linesByStore: Object.fromEntries(
      Object.entries(value.linesByStore).map(([storeId, lines]) => [
        storeId,
        lines.map(restoreLine),
      ]),
    ),
  };
}

function restoreLine(line: CartLine): CartLine {
  const quantity = Math.min(MAX_CART_QUANTITY, Math.max(1, Math.floor(line.quantity)));
  const optionPriceDeltaCents = Number.isSafeInteger(line.optionPriceDeltaCents)
    ? Math.max(0, line.optionPriceDeltaCents ?? 0)
    : Math.max(0, line.unitPriceCents - line.item.basePriceCents);
  const promotionExpired = Boolean(
    line.promotionEndsAt
    && Number.isFinite(Date.parse(line.promotionEndsAt))
    && Date.parse(line.promotionEndsAt) <= Date.now(),
  );
  const unitPriceCents = promotionExpired
    ? line.item.basePriceCents + optionPriceDeltaCents
    : line.unitPriceCents;
  return {
    ...line,
    quantity,
    optionPriceDeltaCents,
    unitPriceCents,
    totalCents: unitPriceCents * quantity,
    ...(promotionExpired ? { promotionId: undefined, promotionEndsAt: undefined } : {}),
  };
}

const snapshotStore = (store: StoreDetail): CartStoreSnapshot => ({
  id: store.id,
  name: store.name,
  coverUrl: store.coverUrl,
  deliveryFeeCents: store.deliveryFeeCents,
  packingFeeCents: store.packingFeeCents,
  minimumOrderCents: store.minimumOrderCents,
  virtualDeliveryMinutes: store.virtualDeliveryMinutes,
  distanceKm: store.distanceKm,
  flashSaleItems: (store.flashSaleItems ?? []).map((promotion) => ({
    promotionId: promotion.promotionId,
    menuItemId: promotion.menuItemId,
    flashPriceCents: promotion.flashPriceCents,
    endsAt: promotion.endsAt,
  })),
  storePromotion: store.storePromotions?.[0]
    ? {
        promotionId: store.storePromotions[0].promotionId,
        tiers: store.storePromotions[0].tiers,
        endsAt: store.storePromotions[0].endsAt,
      }
    : undefined,
});

const snapshotItem = (item: MenuItem): CartItemSnapshot => ({
  id: item.id,
  name: item.name,
  imageUrl: item.imageUrl,
  basePriceCents: item.basePriceCents,
});

const lineTotal = (line: CartLine) => line.unitPriceCents * line.quantity;
const originalLineTotal = (line: CartLine) => (
  line.item.basePriceCents + (line.optionPriceDeltaCents ?? 0)
) * line.quantity;
const promotionIsActive = (endsAt?: string) => {
  const timestamp = endsAt ? Date.parse(endsAt) : Number.NaN;
  return Number.isFinite(timestamp) && timestamp > Date.now();
};
const storeDiscount = (store: CartStoreSnapshot, itemsTotalCents: number): number => {
  if (!promotionIsActive(store.storePromotion?.endsAt)) return 0;
  return [...(store.storePromotion?.tiers ?? [])]
    .filter((tier) => itemsTotalCents >= tier.thresholdCents)
    .sort((left, right) => right.thresholdCents - left.thresholdCents)[0]
    ?.discountCents ?? 0;
};

const makeGroup = (store: CartStoreSnapshot, lines: CartLine[]): CartStoreGroup => {
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const originalItemsTotalCents = lines.reduce((sum, line) => sum + originalLineTotal(line), 0);
  const itemsTotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
  const storeDiscountCents = storeDiscount(store, itemsTotalCents);
  return {
    store,
    lines,
    count,
    originalItemsTotalCents,
    itemsTotalCents,
    storeDiscountCents,
    totalCents: Math.max(
      0,
      itemsTotalCents - storeDiscountCents + store.deliveryFeeCents + store.packingFeeCents,
    ),
  };
};

export const useCartStore = defineStore('cart', {
  state: readState,
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
    originalItemsTotalCents(): number {
      return this.lines.reduce((sum, line) => sum + originalLineTotal(line), 0);
    },
    allItemsTotalCents(): number {
      return this.groups.reduce((sum, group) => sum + group.itemsTotalCents, 0);
    },
    allStoreDiscountCents(): number {
      return this.groups.reduce((sum, group) => sum + group.storeDiscountCents, 0);
    },
    totalCents(): number {
      if (!this.store || !this.lines.length) return 0;
      return makeGroup(this.store, this.lines).totalCents;
    },
    allTotalCents(): number {
      return this.groups.reduce((sum, group) => sum + group.totalCents, 0);
    },
  },
  actions: {
    persist() {
      if (!canUseStorage()) return;
      uni.setStorageSync(CART_STORAGE_KEY, {
        version: 2,
        activeStoreId: this.activeStoreId,
        stores: this.stores,
        linesByStore: this.linesByStore,
      } satisfies PersistedCart);
    },
    selectStore(store: StoreDetail) {
      this.refreshStoreSnapshot(store);
      this.activeStoreId = store.id;
      this.persist();
    },
    refreshStoreSnapshot(store: StoreDetail) {
      this.stores[store.id] = snapshotStore(store);
      if (!this.linesByStore[store.id]) this.linesByStore[store.id] = [];
      for (const line of this.linesByStore[store.id] ?? []) {
        const latestItem = (store.menu ?? []).find((candidate) => candidate.id === line.item.id);
        const latestOptions = latestItem?.specGroups
          .flatMap((group) => group.options)
          .filter((option) => line.optionIds.includes(option.id));
        if (latestItem) {
          line.item = snapshotItem(latestItem);
          line.optionNames = latestOptions?.map((option) => option.name) ?? [];
        }
        const promotion = this.stores[store.id].flashSaleItems?.find((candidate) => (
          candidate.menuItemId === line.item.id && promotionIsActive(candidate.endsAt)
        ));
        const optionPriceDeltaCents = latestItem
          ? (latestOptions ?? []).reduce((sum, option) => sum + option.priceDeltaCents, 0)
          : line.optionPriceDeltaCents
            ?? Math.max(0, line.unitPriceCents - line.item.basePriceCents);
        line.optionPriceDeltaCents = optionPriceDeltaCents;
        line.unitPriceCents = (promotion?.flashPriceCents ?? line.item.basePriceCents) + optionPriceDeltaCents;
        line.promotionId = promotion?.promotionId;
        line.promotionEndsAt = promotion?.endsAt;
        line.totalCents = lineTotal(line);
      }
      this.persist();
    },
    async add(store: StoreDetail, item: MenuItem, optionIds: string[], quantity: number): Promise<boolean> {
      this.selectStore(store);
      const safeQuantity = Math.min(MAX_CART_QUANTITY, Math.max(1, Math.floor(quantity)));
      const allOptions = item.specGroups.flatMap((group) => group.options);
      const options = allOptions.filter((option) => optionIds.includes(option.id));
      const originalUnitPriceCents = calculateLineTotal(
        item.basePriceCents,
        options.map((option) => option.priceDeltaCents),
        1,
      );
      const optionPriceDeltaCents = Math.max(0, originalUnitPriceCents - item.basePriceCents);
      const promotion = this.stores[store.id].flashSaleItems?.find((candidate) => (
        candidate.menuItemId === item.id && promotionIsActive(candidate.endsAt)
      ));
      const unitPriceCents = (promotion?.flashPriceCents ?? item.basePriceCents) + optionPriceDeltaCents;
      const key = `${store.id}:${item.id}:${[...optionIds].sort().join(',')}`;
      const lines = this.linesByStore[store.id] ?? [];
      const existing = lines.find((line) => line.key === key);
      if (existing) {
        existing.quantity = Math.min(MAX_CART_QUANTITY, existing.quantity + safeQuantity);
        existing.totalCents = lineTotal(existing);
      } else {
        lines.push({
          key,
          storeId: store.id,
          item: snapshotItem(item),
          optionIds,
          optionNames: options.map((option) => option.name),
          quantity: safeQuantity,
          optionPriceDeltaCents,
          unitPriceCents,
          totalCents: unitPriceCents * safeQuantity,
          promotionId: promotion?.promotionId,
          promotionEndsAt: promotion?.endsAt,
        });
      }
      this.linesByStore[store.id] = lines;
      this.persist();
      return true;
    },
    applyPromotion(
      storeId: string,
      menuItemId: string,
      flashBasePriceCents: number,
      promotionId?: string,
      promotionEndsAt?: string,
    ) {
      if (!Number.isInteger(flashBasePriceCents) || flashBasePriceCents < 0) return;
      if (promotionEndsAt && Date.parse(promotionEndsAt) <= Date.now()) return;
      for (const line of this.linesByStore[storeId] ?? []) {
        if (line.item.id !== menuItemId) continue;
        const optionPriceDeltaCents = Number.isSafeInteger(line.optionPriceDeltaCents)
          ? Math.max(0, line.optionPriceDeltaCents ?? 0)
          : Math.max(0, line.unitPriceCents - line.item.basePriceCents);
        line.optionPriceDeltaCents = optionPriceDeltaCents;
        line.unitPriceCents = flashBasePriceCents + optionPriceDeltaCents;
        line.promotionId = promotionId;
        line.promotionEndsAt = promotionEndsAt;
        line.totalCents = lineTotal(line);
      }
      this.persist();
    },
    remove(key: string) {
      for (const [storeId, lines] of Object.entries(this.linesByStore)) {
        const next = lines.filter((line) => line.key !== key);
        if (next.length === lines.length) continue;
        if (next.length) this.linesByStore[storeId] = next;
        else {
          delete this.linesByStore[storeId];
          delete this.stores[storeId];
        }
        if (this.activeStoreId === storeId && !next.length) {
          this.activeStoreId = Object.keys(this.linesByStore)[0] ?? '';
        }
        this.persist();
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
      line.quantity = Math.min(MAX_CART_QUANTITY, Math.max(1, Math.floor(quantity)));
      line.totalCents = lineTotal(line);
      this.persist();
    },
    clear(storeId?: string) {
      if (storeId) {
        delete this.linesByStore[storeId];
        delete this.stores[storeId];
        if (this.activeStoreId === storeId) this.activeStoreId = Object.keys(this.linesByStore)[0] ?? '';
        this.persist();
        return;
      }
      this.activeStoreId = '';
      this.stores = {};
      this.linesByStore = {};
      if (canUseStorage()) uni.removeStorageSync(CART_STORAGE_KEY);
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
