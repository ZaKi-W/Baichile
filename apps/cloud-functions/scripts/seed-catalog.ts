import { categories, stores } from '@baichile/catalog-data';
import { requireCatalogImageBaseUrl, rewriteCatalogRecordImages } from '../src/catalog-images';
import type { ManagedContentStatus } from '@baichile/api-contract';
import { collections } from '../src/collections';
import { buildStoreSearchText } from '../src/catalog-search';
import { createCloudBaseDatabase, type Database } from '../src/database';
import type { CategoryDoc, MenuItemDoc, StoreDoc, StoreSubCategoryDoc } from '../src/models';

const PAGE_SIZE = 100;

async function main() {
  requireCatalogImageBaseUrl();
  const db = createCloudBaseDatabase();
  const counts = await seedCatalog(db);
  console.log(`CloudBase catalog seeded: ${counts.categories} categories, ${counts.stores} stores, ${counts.menuItems} menu items`);
}

async function writeInBatches<T>(rows: T[], batchSize: number, write: (row: T) => Promise<unknown>) {
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    await Promise.all(batch.map(write));
  }
}

async function clearCollection(db: Database, name: string) {
  const rows: Record<string, unknown>[] = [];
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const page = await db.collection<Record<string, unknown>>(name).list({ skip, limit: PAGE_SIZE });
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  await writeInBatches(rows, 12, (row) => db.collection(name).remove(String(row._id ?? row.id)));
}

export async function seedCatalog(db: Database) {
  const now = db.now().toISOString();
  const activeStatus: ManagedContentStatus = 'active';

  await clearCollection(db, collections.categories);
  await clearCollection(db, collections.stores);
  await clearCollection(db, collections.storeSubCategories);
  await clearCollection(db, collections.menuItems);

  await writeInBatches(categories.map((category, sortOrder) => ({ ...category, sortOrder })), 8, (category) =>
    db.collection<CategoryDoc>(collections.categories).upsert(category.id, {
      _id: category.id,
      id: category.id,
      name: category.name,
      icon: category.icon,
      sortOrder: category.sortOrder,
    }));

  await writeInBatches(stores.map((store, sortOrder) => ({ ...store, sortOrder })), 8, (store) => {
    const row = rewriteCatalogRecordImages(collections.stores, {
      _id: store.id,
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
      searchText: buildStoreSearchText(
        { name: store.name },
        store.menu.map((item) => ({ name: item.name, status: activeStatus })),
      ),
      sortOrder: store.sortOrder,
      status: activeStatus,
      createdAt: now,
      updatedAt: now,
    });
    return db.collection<StoreDoc>(collections.stores).upsert(store.id, row);
  });

  const subCategories = stores.flatMap((store) =>
    (store.subCategories ?? []).map((subCategory, sortOrder) => ({
      _id: `${store.id}:${subCategory.id}`,
      id: `${store.id}:${subCategory.id}`,
      storeId: store.id,
      subCategoryId: subCategory.id,
      name: subCategory.name,
      sortOrder,
    } satisfies StoreSubCategoryDoc)));
  await writeInBatches(subCategories, 12, (row) =>
    db.collection<StoreSubCategoryDoc>(collections.storeSubCategories).upsert(row.id, row));

  const menuItems = stores.flatMap((store) =>
    store.menu.map((item, sortOrder) => rewriteCatalogRecordImages(collections.menuItems, {
      _id: item.id,
      id: item.id,
      storeId: item.storeId,
      categoryId: item.categoryId,
      subCategoryId: item.subCategoryId ?? null,
      name: item.name,
      subtitle: item.subtitle ?? null,
      imageUrl: item.imageUrl ?? null,
      basePriceCents: item.basePriceCents,
      caloriesKcal: item.caloriesKcal,
      calorieSource: item.calorieSource,
      monthlySales: item.monthlySales,
      specGroups: item.specGroups,
      sourceType: item.sourceType,
      sortOrder,
      status: activeStatus,
      createdAt: now,
      updatedAt: now,
    } satisfies MenuItemDoc)));
  await writeInBatches(menuItems, 10, (row) =>
    db.collection<MenuItemDoc>(collections.menuItems).upsert(row.id, row));

  return {
    categories: categories.length,
    stores: stores.length,
    menuItems: menuItems.length,
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
