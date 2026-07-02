import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { CreatePersistenceTables1760000000000 } from '../src/database/migrations/1760000000000-CreatePersistenceTables';
import { CreateCatalogAndAnalyticsTables1760000001000 } from '../src/database/migrations/1760000001000-CreateCatalogAndAnalyticsTables';
import { AddCalories1760000002000 } from '../src/database/migrations/1760000002000-AddCalories';

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
});
