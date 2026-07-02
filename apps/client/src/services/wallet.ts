import type { WalletSummary, WalletTransaction } from '@baichile/api-contract';
import { useAuthStore } from '../stores/auth';
import { requestApi } from './http';

function token(): string {
  return useAuthStore().accessToken;
}

export const walletService = {
  summary: () => requestApi<WalletSummary>('GET', '/v1/accounts/me/wallet', token()),
  transactions: () => requestApi<WalletTransaction[]>(
    'GET',
    '/v1/accounts/me/wallet/transactions',
    token(),
  ),
  checkIn: () => requestApi<WalletSummary>('POST', '/v1/accounts/me/check-in', token()),
  testCredit: () => requestApi<WalletSummary>('POST', '/v1/accounts/me/test-credit', token()),
};
