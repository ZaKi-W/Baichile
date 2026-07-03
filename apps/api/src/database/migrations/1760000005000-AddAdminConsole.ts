import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminConsole1760000005000 implements MigrationInterface {
  name = 'AddAdminConsole1760000005000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD COLUMN status text NOT NULL DEFAULT 'active',
        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
        ADD CONSTRAINT accounts_status_check CHECK (status IN ('active', 'disabled'));
      ALTER TABLE stores
        ADD COLUMN status text NOT NULL DEFAULT 'active',
        ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
        ADD CONSTRAINT stores_status_check CHECK (status IN ('active', 'inactive'));
      ALTER TABLE menu_items
        ADD COLUMN status text NOT NULL DEFAULT 'active',
        ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
        ADD CONSTRAINT menu_items_status_check CHECK (status IN ('active', 'inactive'));
      ALTER TABLE virtual_orders
        ADD COLUMN admin_status text NOT NULL DEFAULT 'normal',
        ADD COLUMN admin_note text NOT NULL DEFAULT '',
        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
        ADD CONSTRAINT virtual_orders_admin_status_check
          CHECK (admin_status IN ('normal', 'following_up', 'resolved'));

      CREATE TABLE admin_users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username text NOT NULL UNIQUE,
        display_name text NOT NULL,
        password_hash text NOT NULL,
        role text NOT NULL CHECK (role IN ('super_admin', 'operator', 'support')),
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        last_login_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE admin_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX admin_sessions_admin_user_id_idx ON admin_sessions(admin_user_id);
      CREATE TABLE admin_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_user_id uuid NOT NULL REFERENCES admin_users(id),
        action text NOT NULL,
        resource_type text NOT NULL,
        resource_id text,
        before_data jsonb,
        after_data jsonb,
        ip_address text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX admin_audit_logs_admin_user_id_idx ON admin_audit_logs(admin_user_id);
      CREATE INDEX admin_audit_logs_action_idx ON admin_audit_logs(action);
      CREATE INDEX admin_audit_logs_resource_type_idx ON admin_audit_logs(resource_type);

      ALTER TABLE wallet_transactions DROP CONSTRAINT wallet_transactions_type_check;
      ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
        CHECK (type IN ('initial_grant', 'daily_checkin', 'order_payment', 'test_credit',
          'order_refund', 'admin_adjustment'));
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM wallet_transactions WHERE type = 'admin_adjustment';
      ALTER TABLE wallet_transactions DROP CONSTRAINT wallet_transactions_type_check;
      ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
        CHECK (type IN ('initial_grant', 'daily_checkin', 'order_payment', 'test_credit', 'order_refund'));
      DROP TABLE admin_audit_logs;
      DROP TABLE admin_sessions;
      DROP TABLE admin_users;
      ALTER TABLE virtual_orders
        DROP CONSTRAINT virtual_orders_admin_status_check,
        DROP COLUMN updated_at,
        DROP COLUMN admin_note,
        DROP COLUMN admin_status;
      ALTER TABLE menu_items
        DROP CONSTRAINT menu_items_status_check,
        DROP COLUMN updated_at,
        DROP COLUMN created_at,
        DROP COLUMN status;
      ALTER TABLE stores
        DROP CONSTRAINT stores_status_check,
        DROP COLUMN updated_at,
        DROP COLUMN created_at,
        DROP COLUMN status;
      ALTER TABLE accounts
        DROP CONSTRAINT accounts_status_check,
        DROP COLUMN updated_at,
        DROP COLUMN status;
    `);
  }
}
