import { Injectable, NotFoundException } from '@nestjs/common';
import type { HomeResponse, StoreDetail } from '@baichile/api-contract';
import { categories, stores } from './catalog.seed';

@Injectable()
export class CatalogService {
  home(): HomeResponse {
    return { categories, featured: stores.slice(0, 3), stores, nextCursor: null };
  }

  list(categoryId?: string, query?: string): StoreDetail[] {
    const normalized = query?.trim().toLowerCase();
    return stores.filter((store) => {
      const inCategory = !categoryId || store.categoryId === categoryId;
      const searchable = !normalized || store.name.toLowerCase().includes(normalized)
        || store.menu.some((item) => item.name.toLowerCase().includes(normalized));
      return inCategory && searchable;
    });
  }

  find(storeId: string): StoreDetail {
    const store = stores.find((item) => item.id === storeId);
    if (!store) throw new NotFoundException('店铺不存在');
    return store;
  }
}

