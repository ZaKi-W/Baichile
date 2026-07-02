import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWallet1760000003000 implements MigrationInterface {
  name = 'AddWallet1760000003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD COLUMN balance_cents integer NOT NULL DEFAULT 0
        CHECK (balance_cents >= 0);

      CREATE TABLE wallet_transactions (
        id uuid PRIMARY KEY,
        account_id text NOT NULL REFERENCES accounts(id),
        type text NOT NULL CHECK (type IN ('initial_grant', 'daily_checkin', 'order_payment', 'test_credit')),
        amount_cents integer NOT NULL CHECK (amount_cents <> 0),
        balance_after_cents integer NOT NULL CHECK (balance_after_cents >= 0),
        order_id uuid REFERENCES virtual_orders(id),
        description text NOT NULL,
        business_date date,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX wallet_transactions_account_created_idx
        ON wallet_transactions(account_id, created_at DESC);
      CREATE UNIQUE INDEX wallet_transactions_initial_grant_unique
        ON wallet_transactions(account_id) WHERE type = 'initial_grant';
      CREATE UNIQUE INDEX wallet_transactions_daily_checkin_unique
        ON wallet_transactions(account_id, business_date) WHERE type = 'daily_checkin';

      UPDATE accounts SET balance_cents = 30000;
      INSERT INTO wallet_transactions (
        id, account_id, type, amount_cents, balance_after_cents, description
      )
      SELECT gen_random_uuid(), id, 'initial_grant', 30000, 30000, '初始资金'
      FROM accounts;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS wallet_transactions');
    await queryRunner.query('ALTER TABLE accounts DROP COLUMN IF EXISTS balance_cents');
  }
}
