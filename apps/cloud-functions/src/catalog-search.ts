import { collections } from './collections';
import type { Database, ListOptions, Query } from './database';
import type { MenuItemDoc, StoreDoc } from './models';

const PAGE_SIZE = 100;

export function normalizeCatalogSearchText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ');
}

export function buildStoreSearchText(
  store: Pick<StoreDoc, 'name'>,
  menuItems: Array<Pick<MenuItemDoc, 'name' | 'status'>>,
): string {
  return normalizeCatalogSearchText([
    store.name,
    ...menuItems.filter((item) => item.status === 'active').map((item) => item.name),
  ].join('\n'));
}

export async function refreshStoreSearchText(db: Database, storeId: string): Promise<StoreDoc | null> {
  const stores = db.collection<StoreDoc>(collections.stores);
  const store = await stores.get(storeId);
  if (!store) return null;
  const menuItems = await listAll(db.collection<MenuItemDoc>(collections.menuItems), { storeId });
  return stores.update(storeId, {
    searchText: buildStoreSearchText(store, menuItems),
    updatedAt: db.now().toISOString(),
  });
}

export async function backfillStoreSearchText(db: Database): Promise<number> {
  const [stores, menuItems] = await Promise.all([
    listAll(db.collection<StoreDoc>(collections.stores)),
    listAll(db.collection<MenuItemDoc>(collections.menuItems)),
  ]);
  const itemsByStore = new Map<string, MenuItemDoc[]>();
  for (const item of menuItems) {
    const rows = itemsByStore.get(item.storeId) ?? [];
    rows.push(item);
    itemsByStore.set(item.storeId, rows);
  }
  await writeInBatches(stores, 10, (store) => db.collection<StoreDoc>(collections.stores).update(store.id, {
    searchText: buildStoreSearchText(store, itemsByStore.get(store.id) ?? []),
    updatedAt: db.now().toISOString(),
  }));
  return stores.length;
}

async function listAll<T extends object>(
  collection: { list(options?: ListOptions): Promise<T[]> },
  where?: Query,
): Promise<T[]> {
  const rows: T[] = [];
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const page = await collection.list({ where, skip, limit: PAGE_SIZE });
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function writeInBatches<T>(rows: T[], batchSize: number, write: (row: T) => Promise<unknown>): Promise<void> {
  for (let index = 0; index < rows.length; index += batchSize) {
    await Promise.all(rows.slice(index, index + batchSize).map(write));
  }
}
