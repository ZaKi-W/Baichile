import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { rewriteCatalogRecordImages } from '../src/catalog-images';
import { collectionNames } from '../src/collections';

const { Client } = require('pg') as { Client: new (options: { connectionString: string }) => any };

const tableMap: Record<string, string> = {
  accounts: 'accounts',
  visitor_sessions: 'visitor_sessions',
  addresses: 'addresses',
  categories: 'categories',
  stores: 'stores',
  store_sub_categories: 'store_sub_categories',
  menu_items: 'menu_items',
  virtual_orders: 'virtual_orders',
  wallet_transactions: 'wallet_transactions',
  share_reward_configs: 'share_reward_configs',
  share_invites: 'share_invites',
  analytics_events: 'analytics_events',
  admin_users: 'admin_users',
  admin_sessions: 'admin_sessions',
  admin_audit_logs: 'admin_audit_logs',
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('缺少 DATABASE_URL');
  const output = resolve(process.env.CLOUDBASE_EXPORT_FILE || 'tmp/cloudbase-export.json');
  mkdirSync(resolve(output, '..'), { recursive: true });
  const client = new Client({ connectionString: url });
  await client.connect();
  const result: Record<string, unknown[]> = {};
  try {
    for (const name of collectionNames) {
      const table = tableMap[name];
      const { rows } = await client.query(`SELECT * FROM ${table}`);
      result[name] = rows.map((row: Record<string, any>) => normalizeRow(name, row));
      console.log(`${name}: ${rows.length}`);
    }
  } finally {
    await client.end();
  }
  writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(`exported ${output}`);
}

function normalizeRow(collection: string, row: Record<string, any>) {
  const camel = Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamel(key), serialize(value)]));
  const id = String(camel.id ?? camel.token ?? camel.visitorId);
  if (collection === 'share_reward_configs') return rewriteCatalogRecordImages(collection, { _id: 'default', id: 'default', ...camel });
  if (collection === 'share_invites') return rewriteCatalogRecordImages(collection, { _id: String(camel.token), ...camel });
  return rewriteCatalogRecordImages(collection, { _id: id, ...camel, id });
}

function toCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function serialize(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
