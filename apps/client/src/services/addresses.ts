import type { Address } from '@baichile/api-contract';
import { API_BASE } from '../config/api';
import { useAuthStore } from '../stores/auth';

function request<T>(path: string, method: 'GET' | 'POST' = 'GET', data?: unknown): Promise<T> {
  const auth = useAuthStore();
  return new Promise<T>((resolve, reject) => {
    uni.request({
      url: `${API_BASE}${path}`,
      method,
      data: data as UniApp.RequestOptions['data'],
      header: { Authorization: `Bearer ${auth.accessToken}` },
      success: (response) => response.statusCode < 400
        ? resolve(response.data as T)
        : reject(new Error('地址请求失败')),
      fail: reject,
    });
  });
}

export const addressService = {
  list: () => request<Address[]>('/v1/addresses/me'),
  save: (address: Address) => request<Address>('/v1/addresses', 'POST', address),
  remove: (id: string) => request<{ removed: true }>(`/v1/addresses/${id}/delete`, 'POST'),
};

