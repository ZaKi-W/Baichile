import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { createDatabaseOptions } from '../src/database/database.config';
import { seedCatalog } from '../src/database/catalog.seed-runner';

describe('catalog seed', () => {
  let db: DataSource;

  beforeAll(async () => {
    db = new DataSource(createDatabaseOptions());
    await db.initialize();
    await db.runMigrations();
  });

  afterAll(async () => db.destroy());

  it('is idempotent', async () => {
    await seedCatalog(db);
    const first = await Promise.all([
      db.query('SELECT count(*)::int AS count FROM categories'),
      db.query('SELECT count(*)::int AS count FROM stores'),
      db.query('SELECT count(*)::int AS count FROM menu_items'),
    ]);
    await seedCatalog(db);
    const second = await Promise.all([
      db.query('SELECT count(*)::int AS count FROM categories'),
      db.query('SELECT count(*)::int AS count FROM stores'),
      db.query('SELECT count(*)::int AS count FROM menu_items'),
    ]);

    expect(second.map((rows) => rows[0].count)).toEqual(first.map((rows) => rows[0].count));
  });
});
