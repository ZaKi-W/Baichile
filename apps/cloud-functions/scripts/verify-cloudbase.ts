import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectionNames } from '../src/collections';
import { createCloudBaseDatabase } from '../src/database';

async function main() {
  const input = resolve(process.env.CLOUDBASE_EXPORT_FILE || 'tmp/cloudbase-export.json');
  const expected = JSON.parse(readFileSync(input, 'utf8')) as Record<string, Array<Record<string, any>>>;
  const db = createCloudBaseDatabase();
  const failures: string[] = [];

  for (const name of collectionNames) {
    const expectedCount = expected[name]?.length ?? 0;
    const actualCount = await db.collection(name).count();
    if (actualCount !== expectedCount) failures.push(`${name}: expected ${expectedCount}, got ${actualCount}`);
  }

  const accounts = await db.collection<Record<string, any>>('accounts').list();
  const transactions = await db.collection<Record<string, any>>('wallet_transactions').list();
  for (const account of accounts) {
    const balance = transactions
      .filter((tx) => tx.accountId === account.id)
      .reduce((sum, tx) => sum + Number(tx.amountCents ?? 0), 0);
    if (balance !== account.balanceCents) {
      failures.push(`account ${account.id}: balance ${account.balanceCents}, tx sum ${balance}`);
    }
  }

  const stores = new Set((await db.collection<Record<string, any>>('stores').list()).map((row) => row.id));
  const menuItems = await db.collection<Record<string, any>>('menu_items').list();
  for (const item of menuItems) {
    if (!stores.has(item.storeId)) failures.push(`menu item ${item.id}: missing store ${item.storeId}`);
  }

  const orders = await db.collection<Record<string, any>>('virtual_orders').list();
  for (const order of orders) {
    if (!stores.has(order.storeId)) failures.push(`order ${order.id}: missing store ${order.storeId}`);
  }

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('CloudBase migration verification passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
