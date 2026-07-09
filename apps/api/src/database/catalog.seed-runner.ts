import type { DataSource } from 'typeorm';
import { categories, stores } from '../catalog.seed';
import { resolveCatalogImageUrl } from '../catalog-images';
import { CategoryEntity } from './entities/category.entity';
import { MenuItemEntity } from './entities/menu-item.entity';
import { StoreEntity } from './entities/store.entity';
import { StoreSubCategoryEntity } from './entities/store-sub-category.entity';
import { VirtualOrderEntity } from './entities/virtual-order.entity';

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
        coverUrl: resolveCatalogImageUrl(store.coverUrl),
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
        imageUrl: resolveCatalogImageUrl(item.imageUrl),
        basePriceCents: item.basePriceCents,
        caloriesKcal: item.caloriesKcal,
        calorieSource: item.calorieSource,
        monthlySales: item.monthlySales,
        specGroups: item.specGroups,
        sourceType: item.sourceType,
        sortOrder,
      })));
    await manager.getRepository(MenuItemEntity).upsert(menuItems, ['id']);

    const menuById = new Map(stores.flatMap((store) => store.menu).map((item) => [item.id, item]));
    const oldOrders = await manager.getRepository(VirtualOrderEntity).findBy({
      itemsTotalCaloriesKcal: 0,
    });
    for (const order of oldOrders) {
      const lines = (order.lines as Array<{
        menuItemId: string;
        optionNames: string[];
        quantity: number;
        [key: string]: unknown;
      }>).map((line) => {
        const item = menuById.get(line.menuItemId);
        if (!item) return { ...line, unitCaloriesKcal: 0, totalCaloriesKcal: 0 };
        const selected = item.specGroups.flatMap((group) => group.options)
          .filter((option) => line.optionNames.includes(option.name));
        const unitCaloriesKcal = Math.max(0, item.caloriesKcal
          + selected.reduce((sum, option) => sum + option.calorieDeltaKcal, 0));
        return {
          ...line,
          unitCaloriesKcal,
          totalCaloriesKcal: unitCaloriesKcal * line.quantity,
        };
      });
      order.lines = lines;
      order.itemsTotalCaloriesKcal = lines.reduce(
        (sum, line) => sum + Number(line.totalCaloriesKcal),
        0,
      );
      await manager.getRepository(VirtualOrderEntity).save(order);
    }

    return {
      categories: categories.length,
      stores: stores.length,
      menuItems: menuItems.length,
    };
  });
}
