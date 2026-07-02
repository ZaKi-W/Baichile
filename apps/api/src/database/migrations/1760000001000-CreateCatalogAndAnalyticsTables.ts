import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCatalogAndAnalyticsTables1760000001000 implements MigrationInterface {
  name = 'CreateCatalogAndAnalyticsTables1760000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE categories (
        id text PRIMARY KEY, name text NOT NULL, icon text NOT NULL,
        sort_order integer NOT NULL DEFAULT 0
      );
      CREATE TABLE stores (
        id text PRIMARY KEY, category_id text NOT NULL REFERENCES categories(id),
        name text NOT NULL, description text NOT NULL, cover_url text, tags text[] NOT NULL DEFAULT '{}',
        delivery_fee_cents integer NOT NULL CHECK (delivery_fee_cents >= 0),
        packing_fee_cents integer NOT NULL CHECK (packing_fee_cents >= 0),
        minimum_order_cents integer NOT NULL CHECK (minimum_order_cents >= 0),
        virtual_delivery_minutes integer NOT NULL, monthly_sales integer NOT NULL,
        distance_km double precision NOT NULL, rating double precision NOT NULL,
        recent_viewers integer NOT NULL, system_heat integer NOT NULL,
        source_type text NOT NULL, sort_order integer NOT NULL DEFAULT 0
      );
      CREATE INDEX stores_category_idx ON stores(category_id);
      CREATE TABLE store_sub_categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        sub_category_id text NOT NULL, name text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
        UNIQUE(store_id, sub_category_id)
      );
      CREATE TABLE menu_items (
        id text PRIMARY KEY, store_id text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        category_id text NOT NULL REFERENCES categories(id), sub_category_id text,
        name text NOT NULL, subtitle text, image_url text,
        base_price_cents integer NOT NULL CHECK (base_price_cents >= 0),
        monthly_sales integer NOT NULL, spec_groups jsonb NOT NULL DEFAULT '[]',
        source_type text NOT NULL, sort_order integer NOT NULL DEFAULT 0
      );
      CREATE INDEX menu_items_store_idx ON menu_items(store_id);
      CREATE INDEX menu_items_name_idx ON menu_items(lower(name));
      CREATE TABLE analytics_events (
        id bigserial PRIMARY KEY, visitor_id text, account_id text REFERENCES accounts(id),
        event_name text NOT NULL, payload jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX analytics_events_name_idx ON analytics_events(event_name);
      CREATE INDEX analytics_events_visitor_idx ON analytics_events(visitor_id);
      CREATE INDEX analytics_events_account_idx ON analytics_events(account_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS analytics_events, menu_items, store_sub_categories, stores, categories CASCADE');
  }
}
