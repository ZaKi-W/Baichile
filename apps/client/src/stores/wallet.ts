import { defineStore } from 'pinia';
import type { WalletSummary, WalletTransaction } from '@baichile/api-contract';
import { walletService } from '../services/wallet';
import { useAuthStore } from './auth';

const emptySummary = (): WalletSummary => ({ balanceCents: 0, checkedInToday: false });

export const useWalletStore = defineStore('wallet', {
  state: () => ({
    summary: emptySummary(),
    transactions: [] as WalletTransaction[],
    loading: false,
  }),
  actions: {
    async load(includeTransactions = false) {
      const auth = useAuthStore();
      if (!auth.accountId) {
        this.summary = emptySummary();
        this.transactions = [];
        return;
      }
      this.loading = true;
      try {
        const [summary, transactions] = await Promise.all([
          walletService.summary(),
          includeTransactions ? walletService.transactions() : Promise.resolve(this.transactions),
        ]);
        this.summary = summary;
        this.transactions = transactions;
      } finally {
        this.loading = false;
      }
    },
    async checkIn() {
      this.summary = await walletService.checkIn();
    },
    recordPayment(amountCents: number) {
      this.summary.balanceCents = Math.max(0, this.summary.balanceCents - amountCents);
    },
    reset() {
      this.summary = emptySummary();
      this.transactions = [];
    },
  },
});
