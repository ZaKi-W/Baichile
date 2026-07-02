import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePersistenceTables1760000000000 implements MigrationInterface {
  name = 'CreatePersistenceTables1760000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE accounts (
        id text PRIMARY KEY,
        wechat_openid_hash text UNIQUE,
        nickname text,
        avatar_url text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE visitor_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        visitor_id text UNIQUE NOT NULL,
        account_id text REFERENCES accounts(id),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX visitor_sessions_account_idx ON visitor_sessions(account_id);
      CREATE TABLE addresses (
        id text PRIMARY KEY,
        visitor_id text,
        account_id text REFERENCES accounts(id),
        name text NOT NULL,
        phone text NOT NULL,
        address text NOT NULL,
        detail text NOT NULL,
        tag text NOT NULL,
        lat double precision NOT NULL,
        lng double precision NOT NULL,
        is_default boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX addresses_visitor_idx ON addresses(visitor_id);
      CREATE INDEX addresses_account_idx ON addresses(account_id);
      CREATE TABLE virtual_orders (
        id uuid PRIMARY KEY,
        visitor_id text,
        account_id text REFERENCES accounts(id),
        status text NOT NULL,
        store_id text NOT NULL,
        destination_id text NOT NULL,
        started_at timestamptz NOT NULL,
        duration_ms integer NOT NULL CHECK (duration_ms > 0),
        seed text NOT NULL,
        items_total_cents integer NOT NULL CHECK (items_total_cents >= 0),
        delivery_fee_cents integer NOT NULL CHECK (delivery_fee_cents >= 0),
        packing_fee_cents integer NOT NULL CHECK (packing_fee_cents >= 0),
        total_cents integer NOT NULL CHECK (total_cents >= 0),
        lines jsonb NOT NULL,
        route jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX virtual_orders_visitor_idx ON virtual_orders(visitor_id);
      CREATE INDEX virtual_orders_account_idx ON virtual_orders(account_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS virtual_orders, addresses, visitor_sessions, accounts CASCADE');
  }
}
