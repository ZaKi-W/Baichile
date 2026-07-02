import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { CreatePersistenceTables1760000000000 } from '../src/database/migrations/1760000000000-CreatePersistenceTables';
import { CreateCatalogAndAnalyticsTables1760000001000 } from '../src/database/migrations/1760000001000-CreateCatalogAndAnalyticsTables';
import { AddCalories1760000002000 } from '../src/database/migrations/1760000002000-AddCalories';
import { AddWallet1760000003000 } from '../src/database/migrations/1760000003000-AddWallet';
import { AddDeliveryIncidents1760000004000 } from '../src/database/migrations/1760000004000-AddDeliveryIncidents';

describe('persistence migration', () => {
  let db: DataSource;

  beforeAll(async () => {
    db = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      migrations: [
        CreatePersistenceTables1760000000000,
        CreateCatalogAndAnalyticsTables1760000001000,
        AddCalories1760000002000,
        AddWallet1760000003000,
        AddDeliveryIncidents1760000004000,
      ],
    });
    await db.initialize();
    await db.undoLastMigration({ transaction: 'all' }).catch(() => undefined);
    await db.runMigrations();
  });

  afterAll(async () => db.destroy());

  it('creates persistence tables', async () => {
    const rows = await db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [['accounts', 'visitor_sessions', 'addresses', 'virtual_orders']],
    ) as Array<{ table_name: string }>;

    expect(rows.map((row) => row.table_name).sort()).toEqual(
      ['accounts', 'addresses', 'virtual_orders', 'visitor_sessions'],
    );
  });

  it('creates catalog and analytics tables', async () => {
    const rows = await db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [['categories', 'stores', 'store_sub_categories', 'menu_items', 'analytics_events']],
    ) as Array<{ table_name: string }>;

    expect(rows.map((row) => row.table_name).sort()).toEqual(
      ['analytics_events', 'categories', 'menu_items', 'store_sub_categories', 'stores'],
    );
  });

  it('adds calorie snapshots to catalog and orders', async () => {
    const rows = await db.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (table_name, column_name) IN (
           ('menu_items', 'calories_kcal'),
           ('menu_items', 'calorie_source'),
           ('virtual_orders', 'items_total_calories_kcal')
         )`,
    ) as Array<{ table_name: string; column_name: string }>;

    expect(rows).toHaveLength(3);
  });

  it('adds account balances and immutable wallet transactions', async () => {
    const columns = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'balance_cents'`,
    ) as Array<{ column_name: string }>;
    const tables = await db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'wallet_transactions'`,
    ) as Array<{ table_name: string }>;

    expect(columns).toHaveLength(1);
    expect(tables).toHaveLength(1);
  });

  it('adds delivery incident lifecycle columns and unique refunds', async () => {
    const columns = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'virtual_orders'
         AND column_name = ANY($1)`,
      [['incident_key', 'incident_started_at', 'failed_at', 'refunded_at']],
    ) as Array<{ column_name: string }>;
    const indexes = await db.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'wallet_transactions_order_refund_unique'`,
    ) as Array<{ indexname: string }>;

    expect(columns).toHaveLength(4);
    expect(indexes).toHaveLength(1);
  });
});
