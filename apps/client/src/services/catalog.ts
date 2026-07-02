import type { HomeResponse, StoreDetail } from '@baichile/api-contract';
import { mockCategories, mockStores } from '../mock/catalog';
import { API_BASE } from '../config/api';

async function request<T>(path: string): Promise<T> {
  if (!API_BASE) throw new Error('mock');
  return new Promise<T>((resolve, reject) => {
    uni.request({
      url: `${API_BASE}${path}`,
      success: (response) => response.statusCode < 400 ? resolve(response.data as T) : reject(new Error('接口请求失败')),
      fail: reject,
    });
  });
}

export const catalogService = {
  async home(): Promise<HomeResponse> {
    try { return await request<HomeResponse>('/v1/catalog/home'); }
    catch { return { categories: mockCategories, featured: mockStores.slice(0, 3), stores: mockStores, nextCursor: null }; }
  },
  async store(id: string): Promise<StoreDetail> {
    try { return await request<StoreDetail>(`/v1/catalog/stores/${id}`); }
    catch {
      const store = mockStores.find((item) => item.id === id);
      if (!store) throw new Error('店铺不存在');
      return store;
    }
  },
  async search(query: string): Promise<StoreDetail[]> {
    try { return await request<StoreDetail[]>(`/v1/catalog/search?q=${encodeURIComponent(query)}`); }
    catch { return mockStores.filter((store) => store.name.includes(query) || store.menu.some((item) => item.name.includes(query))); }
  },
  async byCategory(categoryId: string): Promise<StoreDetail[]> {
    try { return await request<StoreDetail[]>(`/v1/catalog/stores?categoryId=${categoryId}`); }
    catch { return mockStores.filter((store) => store.categoryId === categoryId); }
  },
};
