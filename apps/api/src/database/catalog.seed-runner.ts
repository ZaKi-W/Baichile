import type { DataSource } from 'typeorm';
import { categories, stores } from '../catalog.seed';
import { CategoryEntity } from './entities/category.entity';
import { MenuItemEntity } from './entities/menu-item.entity';
import { StoreEntity } from './entities/store.entity';
import { StoreSubCategoryEntity } from './entities/store-sub-category.entity';

export async function seedCatalog(dataSource: DataSource) {
  return dataSource.transaction(async (manager) => {
    await manager.getRepository(CategoryEntity).upsert(
      categories.map((category, sortOrder) => ({ ...category, sortOrder })),
      ['id'],
    );
    await manager.getRepository(StoreEntity).upsert(
      stores.map((store, sortOrder) => ({
        id: store.id,
        categoryId: store.categoryId,
        name: store.name,
        description: store.description,
        coverUrl: store.coverUrl ?? null,
        tags: store.tags,
        deliveryFeeCents: store.deliveryFeeCents,
        packingFeeCents: store.packingFeeCents,
        minimumOrderCents: store.minimumOrderCents,
        virtualDeliveryMinutes: store.virtualDeliveryMinutes,
        monthlySales: store.monthlySales,
        distanceKm: store.distanceKm,
        rating: store.rating,
        recentViewers: store.recentViewers,
        systemHeat: store.systemHeat,
        sourceType: store.sourceType,
        sortOrder,
      })),
      ['id'],
    );

    const subCategories = stores.flatMap((store) =>
      (store.subCategories ?? []).map((subCategory, sortOrder) => ({
        storeId: store.id,
        subCategoryId: subCategory.id,
        name: subCategory.name,
        sortOrder,
      })));
    if (subCategories.length) {
      await manager.getRepository(StoreSubCategoryEntity).upsert(
        subCategories,
        ['storeId', 'subCategoryId'],
      );
    }

    const menuItems = stores.flatMap((store) =>
      store.menu.map((item, sortOrder) => ({
        id: item.id,
        storeId: item.storeId,
        categoryId: item.categoryId,
        subCategoryId: item.subCategoryId ?? null,
        name: item.name,
        subtitle: item.subtitle ?? null,
        imageUrl: item.imageUrl ?? null,
        basePriceCents: item.basePriceCents,
        monthlySales: item.monthlySales,
        specGroups: item.specGroups,
        sourceType: item.sourceType,
        sortOrder,
      })));
    await manager.getRepository(MenuItemEntity).upsert(menuItems, ['id']);

    return {
      categories: categories.length,
      stores: stores.length,
      menuItems: menuItems.length,
    };
  });
}
