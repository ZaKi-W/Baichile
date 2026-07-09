import type { HomeResponse, StoreDetail } from '@baichile/api-contract';
import { requestApi } from './http';

export const catalogService = {
  async home(): Promise<HomeResponse> {
    return requestApi<HomeResponse>('GET', '/v1/catalog/home', '');
  },
  async store(id: string): Promise<StoreDetail> {
    return requestApi<StoreDetail>('GET', `/v1/catalog/stores/${id}`, '');
  },
  async search(query: string): Promise<StoreDetail[]> {
    return requestApi<StoreDetail[]>('GET', `/v1/catalog/search?q=${encodeURIComponent(query)}`, '');
  },
  async byCategory(categoryId: string): Promise<StoreDetail[]> {
    return requestApi<StoreDetail[]>('GET', `/v1/catalog/stores?categoryId=${categoryId}`, '');
  },
};
