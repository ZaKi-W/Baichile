import { defineStore } from 'pinia';
import type { Address } from '@baichile/api-contract';
import { addressService } from '../services/addresses';
import { useAuthStore } from './auth';

export type { Address } from '@baichile/api-contract';

const selectedKey = (ownerId: string) => `baichile:selected-address:${ownerId}`;

export const useAddressStore = defineStore('address', {
  state: () => ({
    addresses: [] as Address[],
    selectedId: '',
  }),
  getters: {
    selected: (state) =>
      state.addresses.find((address) => address.id === state.selectedId)
      ?? state.addresses.find((address) => address.isDefault)
      ?? state.addresses[0]
      ?? null,
  },
  actions: {
    async load() {
      const auth = useAuthStore();
      await auth.ensureGuest();
      const ownerId = auth.accountId || auth.visitorId;
      if (!ownerId) {
        this.addresses = [];
        this.selectedId = '';
        return;
      }
      this.addresses = await addressService.list();
      const savedId = uni.getStorageSync(selectedKey(ownerId)) as string;
      this.selectedId = this.addresses.some((address) => address.id === savedId)
        ? savedId
        : this.addresses.find((address) => address.isDefault)?.id || this.addresses[0]?.id || '';
      if (this.selectedId) uni.setStorageSync(selectedKey(ownerId), this.selectedId);
    },
    select(id: string) {
      const auth = useAuthStore();
      const ownerId = auth.accountId || auth.visitorId;
      if (!ownerId || !this.addresses.some((address) => address.id === id)) return;
      this.selectedId = id;
      uni.setStorageSync(selectedKey(ownerId), id);
    },
    async save(address: Address) {
      const saved = await addressService.save(address);
      const index = this.addresses.findIndex((item) => item.id === saved.id);
      if (saved.isDefault) {
        this.addresses = this.addresses.map((item) => ({ ...item, isDefault: false }));
      }
      if (index >= 0) this.addresses[index] = saved;
      else this.addresses.push(saved);
      if (!this.selectedId || saved.isDefault) this.select(saved.id);
    },
    async remove(id: string) {
      await addressService.remove(id);
      this.addresses = this.addresses.filter((address) => address.id !== id);
      if (this.selectedId === id) {
        this.selectedId = this.addresses.find((address) => address.isDefault)?.id || this.addresses[0]?.id || '';
        if (this.selectedId) this.select(this.selectedId);
      }
    },
  },
});
