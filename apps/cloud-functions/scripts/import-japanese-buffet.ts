import { japaneseBuffetStore } from '@baichile/catalog-data';
import type { ManagedContentStatus } from '@baichile/api-contract';
import { buildStoreSearchText } from '../src/catalog-search';
import { rewriteCatalogRecordImages, requireCatalogImageBaseUrl } from '../src/catalog-images';
import { collections } from '../src/collections';
import { createCloudBaseDatabase } from '../src/database';
import type { MenuItemDoc, StoreDoc, StoreSubCategoryDoc } from '../src/models';

async function main() {
  requireCatalogImageBaseUrl();
  const db = createCloudBaseDatabase();
  const now = db.now().toISOString();
  const status: ManagedContentStatus = 'active';
  const store = japaneseBuffetStore;

  const storeRow = rewriteCatalogRecordImages(collections.stores, {
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
      store.menu.map((item) => ({ name: item.name, status })),
    ),
    sortOrder: 0,
    status,
    createdAt: now,
    updatedAt: now,
  } satisfies StoreDoc);
  await db.collection<StoreDoc>(collections.stores).upsert(store.id, storeRow);

  const subCategories = (store.subCategories ?? []).map((subCategory, sortOrder) => ({
    _id: `${store.id}:${subCategory.id}`,
    id: `${store.id}:${subCategory.id}`,
    storeId: store.id,
    subCategoryId: subCategory.id,
    name: subCategory.name,
    sortOrder,
  } satisfies StoreSubCategoryDoc));
  await Promise.all(subCategories.map((row) =>
    db.collection<StoreSubCategoryDoc>(collections.storeSubCategories).upsert(row.id, row)));

  const menuItems = store.menu.map((item, sortOrder) => rewriteCatalogRecordImages(collections.menuItems, {
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
    status,
    createdAt: now,
    updatedAt: now,
  } satisfies MenuItemDoc));
  await Promise.all(menuItems.map((row) => db.collection<MenuItemDoc>(collections.menuItems).upsert(row.id, row)));

  console.log(`Imported ${store.name}: 1 store, ${subCategories.length} sub-categories, ${menuItems.length} menu items.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
