import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { categories, stores as seedStores } from '@baichile/catalog-data';
import { collectionNames } from '../src/collections';
import { createCloudBaseDatabase, type CollectionStore } from '../src/database';

const PAGE_SIZE = 100;

async function main() {
  const input = resolve(process.env.CLOUDBASE_EXPORT_FILE || 'tmp/cloudbase-export.json');
  const expected = existsSync(input)
    ? JSON.parse(readFileSync(input, 'utf8')) as Record<string, Array<Record<string, unknown>>>
    : expectedFromCatalogSeed();
  const db = createCloudBaseDatabase();
  const failures: string[] = [];

  for (const name of collectionNames) {
    if (!(name in expected)) continue;
    const expectedCount = expected[name]?.length ?? 0;
    const actualCount = await db.collection(name).count();
    if (actualCount !== expectedCount) failures.push(`${name}: expected ${expectedCount}, got ${actualCount}`);
  }

  const accounts = await listAll(db.collection<Record<string, unknown>>('accounts'));
  const transactions = await listAll(db.collection<Record<string, unknown>>('wallet_transactions'));
  for (const account of accounts) {
    const balance = transactions
      .filter((tx) => tx.accountId === account.id)
      .reduce((sum, tx) => sum + Number(tx.amountCents ?? 0), 0);
    if (balance !== Number(account.balanceCents ?? 0)) {
      failures.push(`account ${account.id}: balance ${account.balanceCents}, tx sum ${balance}`);
    }
  }

  const stores = new Set((await listAll(db.collection<Record<string, unknown>>('stores'))).map((row) => row.id));
  const menuItems = await listAll(db.collection<Record<string, unknown>>('menu_items'));
  for (const item of menuItems) {
    if (!stores.has(item.storeId)) failures.push(`menu item ${item.id}: missing store ${item.storeId}`);
  }

  const orders = await listAll(db.collection<Record<string, unknown>>('virtual_orders'));
  for (const order of orders) {
    if (!stores.has(order.storeId)) failures.push(`order ${order.id}: missing store ${order.storeId}`);
  }

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('CloudBase verification passed.');
}

function expectedFromCatalogSeed(): Record<string, Array<Record<string, unknown>>> {
  return {
    categories: categories.map((category) => ({ id: category.id })),
    stores: seedStores.map((store) => ({ id: store.id })),
    store_sub_categories: seedStores.flatMap((store) =>
      (store.subCategories ?? []).map((subCategory) => ({ id: `${store.id}:${subCategory.id}` }))),
    menu_items: seedStores.flatMap((store) =>
      store.menu.map((item) => ({ id: item.id, storeId: item.storeId }))),
  };
}

async function listAll<T extends Record<string, unknown>>(collection: CollectionStore<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const page = await collection.list({ skip, limit: PAGE_SIZE });
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
