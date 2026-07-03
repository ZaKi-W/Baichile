import { existsSync } from 'node:fs';
import type { DataSource } from 'typeorm';
import { In, Not } from 'typeorm';
import { estimateCalories } from '../calorie-estimates';
import { CategoryEntity } from './entities/category.entity';
import { MenuItemEntity } from './entities/menu-item.entity';
import { StoreEntity } from './entities/store.entity';
import { StoreSubCategoryEntity } from './entities/store-sub-category.entity';

export interface ChownowSubCategory {
  id: string;
  name: string;
  sortOrder?: number;
}

export interface ChownowMenuItem {
  id: string;
  subCategoryId?: string;
  name: string;
  price: number;
  description?: string;
  image_url?: string;
  has_local_image?: boolean;
  local_image_path?: string;
}

export interface ChownowStore {
  id: string;
  categoryId?: string;
  name: string;
  rating?: number;
  phone?: string;
  address?: string;
  cover?: string;
  subCategories?: ChownowSubCategory[];
  menuItems?: ChownowMenuItem[];
}

interface BuildImportOptions {
  source?: string;
  translatedNames?: Record<string, string>;
  translationKey?: (
    kind: 'store' | 'item',
    source: string,
    id: string,
    original: string,
  ) => string;
}

export interface CatalogSourceInput {
  source: string;
  stores: ChownowStore[];
}

export const CHOWNOW_CATEGORIES = [
  { id: 'western', name: '西餐', icon: 'burger', sortOrder: 8 },
  { id: 'coffee', name: '咖啡', icon: 'milkTea', sortOrder: 9 },
  { id: 'mexican', name: '墨西哥菜', icon: 'rice', sortOrder: 10 },
  { id: 'japanese', name: '日料', icon: 'noodles', sortOrder: 11 },
  { id: 'chinese', name: '中餐', icon: 'rice', sortOrder: 12 },
  { id: 'korean', name: '韩餐', icon: 'rice', sortOrder: 13 },
  { id: 'healthy', name: '健康轻食', icon: 'rice', sortOrder: 14 },
];

const CATEGORY_NAMES: Record<string, string> = {
  burger: '汉堡',
  dessert: '甜品',
  tea: '奶茶',
  western: '西餐',
  coffee: '咖啡',
  mexican: '墨西哥菜',
  japanese: '日料',
  chinese: '中餐',
  korean: '韩餐',
  healthy: '健康轻食',
};

export function classifyChownowStore(name: string): string {
  const normalized = name.toLowerCase();
  if (/totoyama|toto musubee|ramen|sushi|onigiri|sugarfish|kazunori|yuko kitchen|zutto|wokcano/.test(normalized)) return 'japanese';
  if (/buddha bodai|bodhi kosher|wok in duane/.test(normalized)) return 'chinese';
  if (/broken mouth|homestyle/.test(normalized)) return 'korean';
  if (/power bowls|daily grocer|vineyard/.test(normalized)) return 'healthy';
  if (/la salsa|wendy.*torta|taco|mexic/.test(normalized)) return 'mexican';
  if (/flouring|cake|dessert|bakery/.test(normalized)) return 'dessert';
  if (/hey hey|milk tea|boba|gong cha/.test(normalized)) return 'tea';
  if (/groundwork|harbor house|le cafe coffee|espresso|coffee/.test(normalized)) return 'coffee';
  if (/atomic wings/.test(normalized)) return 'fried';
  if (/maple block meat/.test(normalized)) return 'bbq';
  if (/dino/.test(normalized)) return 'burger';
  return 'western';
}

export function cleanSubCategoryName(name: string): string {
  return name
    .split(/\s+(?:--+|-)\s*if you need/i)[0]
    .replace(/\s*--+\s*/g, ' / ')
    .trim() || '其他';
}

export function normalizeCatalogName(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['’]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function sourceId(source: string | undefined, id: string): string {
  return source ? `${source}:${id}` : id;
}

function itemCompleteness(item: ChownowMenuItem): number {
  return Number(Boolean(item.description?.trim())) * 2
    + Number(Boolean(item.image_url?.trim()))
    + Number(Boolean(item.local_image_path));
}

function translatedName(
  options: BuildImportOptions,
  kind: 'store' | 'item',
  id: string,
  original: string,
): string {
  const source = options.source ?? 'chownow';
  const key = options.translationKey?.(kind, source, id, original)
    ?? `${kind}:${source}:${id}`;
  return options.translatedNames?.[key] ?? original;
}

export function buildChownowImport(
  rawStores: ChownowStore[],
  fileExists: (path: string) => boolean = existsSync,
  options: BuildImportOptions = {},
) {
  const stores: Array<Record<string, unknown>> = [];
  const subCategories: Array<Record<string, unknown>> = [];
  const menuItems: Array<Record<string, unknown>> = [];
  const seenStoreNames = new Set<string>();

  rawStores.forEach((rawStore, storeIndex) => {
    const normalizedStoreName = normalizeCatalogName(rawStore.name);
    if (!normalizedStoreName || seenStoreNames.has(normalizedStoreName)) return;

    const eligibleByKey = new Map<string, ChownowMenuItem>();
    (rawStore.menuItems ?? []).filter((item) =>
      item.has_local_image === true
      && Boolean(item.image_url?.trim())
      && Boolean(item.local_image_path)
      && fileExists(item.local_image_path!))
      .forEach((item) => {
        const priceCents = Math.max(0, Math.round(Number(item.price) * 100));
        const key = `${normalizeCatalogName(item.name)}\u0000${priceCents}`;
        const current = eligibleByKey.get(key);
        if (!current || itemCompleteness(item) > itemCompleteness(current)) {
          eligibleByKey.set(key, item);
        }
      });
    const eligibleItems = [...eligibleByKey.values()];
    if (!rawStore.cover?.trim() || !eligibleItems.length) return;
    seenStoreNames.add(normalizedStoreName);

    const categoryId = classifyChownowStore(rawStore.name);
    const storeId = sourceId(options.source, rawStore.id);
    const usedSubCategoryIds = new Set(
      eligibleItems.map((item) => item.subCategoryId || 'other'),
    );
    const originalSubCategories = new Map(
      (rawStore.subCategories ?? []).map((item) => [item.id, item]),
    );

    stores.push({
      id: storeId,
      categoryId,
      name: translatedName(options, 'store', rawStore.id, rawStore.name),
      description: [rawStore.address, rawStore.phone ? `电话 ${rawStore.phone}` : '']
        .filter(Boolean).join(' · ') || '图片菜单商家',
      coverUrl: rawStore.cover,
      tags: [CATEGORY_NAMES[categoryId], '图片菜单'],
      deliveryFeeCents: 0,
      packingFeeCents: 0,
      minimumOrderCents: 0,
      virtualDeliveryMinutes: 30,
      monthlySales: Math.max(100, eligibleItems.length * 37),
      distanceKm: Number((1 + (storeIndex % 8) * 0.4).toFixed(1)),
      rating: Math.min(5, Math.max(0, rawStore.rating ?? 4.5)),
      recentViewers: 100 + eligibleItems.length * 3,
      systemHeat: 70,
      sourceType: 'derived',
      sortOrder: 1000 + storeIndex,
      status: 'active',
    });

    [...usedSubCategoryIds].forEach((subCategoryId, sortOrder) => {
      const original = originalSubCategories.get(subCategoryId);
      subCategories.push({
        storeId,
        subCategoryId,
        name: cleanSubCategoryName(original?.name ?? '其他'),
        sortOrder,
      });
    });

    eligibleItems.forEach((item, sortOrder) => {
      const calorieEstimate = estimateCalories(item.name, categoryId);
      menuItems.push({
        id: sourceId(options.source, item.id),
        storeId,
        categoryId,
        subCategoryId: item.subCategoryId || 'other',
        name: translatedName(options, 'item', item.id, item.name),
        subtitle: item.description?.trim() || null,
        imageUrl: item.image_url!.trim(),
        basePriceCents: Math.max(0, Math.round(Number(item.price) * 100)),
        ...calorieEstimate,
        monthlySales: Math.max(20, 300 - sortOrder * 3),
        specGroups: [],
        sourceType: 'derived',
        sortOrder,
        status: 'active',
      });
    });
  });

  return { stores, subCategories, menuItems };
}

export function buildMultiSourceImport(
  inputs: CatalogSourceInput[],
  fileExists: (path: string) => boolean = existsSync,
  translatedNames: Record<string, string> = {},
  translationKey?: BuildImportOptions['translationKey'],
) {
  const seenStoreNames = new Set<string>();
  const combined = {
    stores: [] as Array<Record<string, unknown>>,
    subCategories: [] as Array<Record<string, unknown>>,
    menuItems: [] as Array<Record<string, unknown>>,
  };

  inputs.forEach((input) => {
    const uniqueStores = input.stores.filter((store) => {
      const key = normalizeCatalogName(store.name);
      if (!key || seenStoreNames.has(key)) return false;
      seenStoreNames.add(key);
      return true;
    });
    const catalog = buildChownowImport(uniqueStores, fileExists, {
      source: input.source,
      translatedNames,
      translationKey,
    });
    combined.stores.push(...catalog.stores);
    combined.subCategories.push(...catalog.subCategories);
    combined.menuItems.push(...catalog.menuItems);
  });
  return combined;
}

export async function importChownowCatalog(
  dataSource: DataSource,
  rawStores: ChownowStore[],
  options: { replaceDerived?: boolean } = {},
) {
  const catalog = buildChownowImport(rawStores);
  return importBuiltCatalog(dataSource, catalog, options);
}

export async function importBuiltCatalog(
  dataSource: DataSource,
  catalog: ReturnType<typeof buildMultiSourceImport>,
  options: { replaceDerived?: boolean } = {},
) {
  let removedStores = 0;
  let skippedDuplicateStores = 0;
  await dataSource.transaction(async (manager) => {
    await manager.getRepository(CategoryEntity).upsert(CHOWNOW_CATEGORIES, ['id']);
    const managedStores = await manager.getRepository(StoreEntity).find({
      where: { sourceType: Not('derived') },
    });
    const managedNames = new Set(managedStores.map((store) => normalizeCatalogName(store.name)));
    const duplicateIds = new Set(
      catalog.stores
        .filter((store) => managedNames.has(normalizeCatalogName(String(store.name))))
        .map((store) => String(store.id)),
    );
    skippedDuplicateStores = duplicateIds.size;
    if (duplicateIds.size) {
      catalog = {
        stores: catalog.stores.filter((store) => !duplicateIds.has(String(store.id))),
        subCategories: catalog.subCategories.filter(
          (item) => !duplicateIds.has(String(item.storeId)),
        ),
        menuItems: catalog.menuItems.filter((item) => !duplicateIds.has(String(item.storeId))),
      };
    }
    if (options.replaceDerived) {
      const existing = await manager.getRepository(StoreEntity).findBy({ sourceType: 'derived' });
      const existingIds = existing.map((store) => store.id);
      removedStores = existingIds.length;
      if (existingIds.length) {
        await manager.getRepository(MenuItemEntity).delete({ storeId: In(existingIds) });
        await manager.getRepository(StoreSubCategoryEntity).delete({ storeId: In(existingIds) });
        await manager.getRepository(StoreEntity).delete({ id: In(existingIds) });
      }
    }
    const storeIds = catalog.stores.map((store) => String(store.id));
    if (storeIds.length) {
      await manager.getRepository(MenuItemEntity).delete({ storeId: In(storeIds) });
      await manager.getRepository(StoreSubCategoryEntity).delete({ storeId: In(storeIds) });
      await manager.getRepository(StoreEntity).upsert(catalog.stores, ['id']);
      await manager.getRepository(StoreSubCategoryEntity).upsert(
        catalog.subCategories,
        ['storeId', 'subCategoryId'],
      );
      await manager.getRepository(MenuItemEntity).upsert(catalog.menuItems, ['id']);
    }
  });
  return {
    categories: CHOWNOW_CATEGORIES.length,
    removedStores,
    skippedDuplicateStores,
    stores: catalog.stores.length,
    menuItems: catalog.menuItems.length,
    subCategories: catalog.subCategories.length,
  };
}
