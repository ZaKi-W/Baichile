import type { MigrationInterface, QueryRunner } from 'typeorm';
import { DEFAULT_SHARE_REWARD_CONFIG } from '../../share/share-domain';

export class AddShareRewards1760000006000 implements MigrationInterface {
  name = 'AddShareRewards1760000006000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wallet_transactions DROP CONSTRAINT wallet_transactions_type_check;
      ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
        CHECK (type IN ('initial_grant', 'daily_checkin', 'order_payment', 'test_credit',
          'order_refund', 'admin_adjustment', 'share_initiated', 'referral_inviter', 'referral_invitee'));
      CREATE TABLE share_reward_configs (
        id text PRIMARY KEY,
        config jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE share_invites (
        token uuid PRIMARY KEY,
        inviter_account_id text NOT NULL REFERENCES accounts(id),
        kind text NOT NULL CHECK (kind IN ('order', 'achievement', 'invitation')),
        order_id uuid REFERENCES virtual_orders(id),
        title text NOT NULL,
        snapshot jsonb NOT NULL,
        initiated_reward_granted boolean NOT NULL DEFAULT false,
        invitee_account_id text REFERENCES accounts(id),
        completed_at timestamptz,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX share_invites_inviter_idx ON share_invites(inviter_account_id);
      CREATE UNIQUE INDEX share_invites_invitee_unique
        ON share_invites(invitee_account_id) WHERE invitee_account_id IS NOT NULL;
    `);
    await queryRunner.query(
      `INSERT INTO share_reward_configs(id, config) VALUES ('default', $1::jsonb)`,
      [JSON.stringify(DEFAULT_SHARE_REWARD_CONFIG)],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE share_invites;
      DROP TABLE share_reward_configs;
      DELETE FROM wallet_transactions
        WHERE type IN ('share_initiated', 'referral_inviter', 'referral_invitee');
      ALTER TABLE wallet_transactions DROP CONSTRAINT wallet_transactions_type_check;
      ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
        CHECK (type IN ('initial_grant', 'daily_checkin', 'order_payment', 'test_credit',
          'order_refund', 'admin_adjustment'));
    `);
  }
}
