import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeliveryIncidents1760000004000 implements MigrationInterface {
  name = 'AddDeliveryIncidents1760000004000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE virtual_orders
        ADD COLUMN incident_key text,
        ADD COLUMN incident_started_at timestamptz,
        ADD COLUMN failed_at timestamptz,
        ADD COLUMN refunded_at timestamptz;

      ALTER TABLE wallet_transactions DROP CONSTRAINT wallet_transactions_type_check;
      ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
        CHECK (type IN ('initial_grant', 'daily_checkin', 'order_payment', 'test_credit', 'order_refund'));
      CREATE UNIQUE INDEX wallet_transactions_order_refund_unique
        ON wallet_transactions(order_id) WHERE type = 'order_refund';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS wallet_transactions_order_refund_unique;
      DELETE FROM wallet_transactions WHERE type = 'order_refund';
      ALTER TABLE wallet_transactions DROP CONSTRAINT wallet_transactions_type_check;
      ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
        CHECK (type IN ('initial_grant', 'daily_checkin', 'order_payment', 'test_credit'));
      ALTER TABLE virtual_orders
        DROP COLUMN refunded_at,
        DROP COLUMN failed_at,
        DROP COLUMN incident_started_at,
        DROP COLUMN incident_key;
    `);
  }
}
