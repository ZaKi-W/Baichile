import type { Address } from '@baichile/api-contract';
import { useAuthStore } from '../stores/auth';
import { requestApi } from './http';

function request<T>(path: string, method: 'GET' | 'POST' = 'GET', data?: unknown): Promise<T> {
  const auth = useAuthStore();
  return requestApi<T>(method, path, auth.accessToken, data);
}

export const addressService = {
  list: () => request<Address[]>('/v1/addresses/me'),
  save: (address: Address) => request<Address>('/v1/addresses', 'POST', address),
  remove: (id: string) => request<{ removed: true }>(`/v1/addresses/${id}/delete`, 'POST'),
};
