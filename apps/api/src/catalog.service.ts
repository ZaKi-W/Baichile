import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { CalorieSource, HomeResponse, MenuItem, SourceType, StoreDetail } from '@baichile/api-contract';
import type { SpecGroup } from '@baichile/domain';
import { In, Repository } from 'typeorm';
import { CategoryEntity } from './database/entities/category.entity';
import { MenuItemEntity } from './database/entities/menu-item.entity';
import { StoreEntity } from './database/entities/store.entity';
import { StoreSubCategoryEntity } from './database/entities/store-sub-category.entity';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(CategoryEntity) private readonly categories: Repository<CategoryEntity>,
    @InjectRepository(StoreEntity) private readonly stores: Repository<StoreEntity>,
    @InjectRepository(MenuItemEntity) private readonly menuItems: Repository<MenuItemEntity>,
    @InjectRepository(StoreSubCategoryEntity) private readonly subCategories: Repository<StoreSubCategoryEntity>,
  ) {}

  async home(): Promise<HomeResponse> {
    const [categories, stores] = await Promise.all([
      this.categories.find({ order: { sortOrder: 'ASC' } }),
      this.list(),
    ]);
    return {
      categories: categories.map(({ id, name, icon }) => ({ id, name, icon })),
      featured: stores.slice(0, 3),
      stores,
      nextCursor: null,
    };
  }

  async list(categoryId?: string, query?: string): Promise<StoreDetail[]> {
    const rows = await this.stores.find({
      where: categoryId ? { categoryId } : {},
      order: { sortOrder: 'ASC' },
    });
    const details = await this.assemble(rows);
    const normalized = query?.trim().toLowerCase();
    return normalized
      ? details.filter((store) => store.name.toLowerCase().includes(normalized)
        || store.menu.some((item) => item.name.toLowerCase().includes(normalized)))
      : details;
  }

  async find(storeId: string): Promise<StoreDetail> {
    const row = await this.stores.findOneBy({ id: storeId });
    if (!row) throw new NotFoundException('店铺不存在');
    return (await this.assemble([row]))[0];
  }

  private async assemble(rows: StoreEntity[]): Promise<StoreDetail[]> {
    if (!rows.length) return [];
    const ids = rows.map(({ id }) => id);
    const [items, subs] = await Promise.all([
      this.menuItems.find({ where: { storeId: In(ids) }, order: { sortOrder: 'ASC' } }),
      this.subCategories.find({ where: { storeId: In(ids) }, order: { sortOrder: 'ASC' } }),
    ]);
    return rows.map((store) => ({
      id: store.id, name: store.name, categoryId: store.categoryId, description: store.description,
      coverUrl: store.coverUrl ?? undefined, tags: store.tags,
      deliveryFeeCents: store.deliveryFeeCents, packingFeeCents: store.packingFeeCents,
      minimumOrderCents: store.minimumOrderCents, virtualDeliveryMinutes: store.virtualDeliveryMinutes,
      monthlySales: store.monthlySales, distanceKm: store.distanceKm, rating: store.rating,
      recentViewers: store.recentViewers, systemHeat: store.systemHeat,
      sourceType: store.sourceType as SourceType,
      menu: items.filter((item) => item.storeId === store.id).map((item): MenuItem => ({
        id: item.id, storeId: item.storeId, categoryId: item.categoryId,
        subCategoryId: item.subCategoryId ?? undefined, name: item.name,
        subtitle: item.subtitle ?? undefined, imageUrl: item.imageUrl ?? undefined,
        basePriceCents: item.basePriceCents, monthlySales: item.monthlySales,
        caloriesKcal: item.caloriesKcal, calorieSource: item.calorieSource as CalorieSource,
        specGroups: item.specGroups as SpecGroup[], sourceType: item.sourceType as SourceType,
      })),
      subCategories: subs.filter((item) => item.storeId === store.id)
        .map((item) => ({ id: item.subCategoryId, name: item.name })),
    }));
  }
}
