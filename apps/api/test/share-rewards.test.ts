import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { createDatabaseOptions } from '../src/database/database.config';
import { AccountEntity } from '../src/database/entities/account.entity';
import { ShareService } from '../src/share/share.service';

describe('share rewards', () => {
  let database: DataSource;
  let service: ShareService;
  const inviterId = `account_share_inviter_${randomUUID()}`;
  const inviteeId = `account_share_invitee_${randomUUID()}`;

  beforeAll(async () => {
    loadEnv({ path: new URL('../.env', import.meta.url).pathname, quiet: true });
    database = new DataSource(createDatabaseOptions());
    await database.initialize();
    await database.runMigrations();
    await database.getRepository(AccountEntity).insert([
      { id: inviterId, balanceCents: 0, status: 'active', wechatOpenIdHash: null, nickname: null, avatarUrl: null },
      { id: inviteeId, balanceCents: 0, status: 'active', wechatOpenIdHash: null, nickname: null, avatarUrl: null },
    ]);
    service = new ShareService(database);
  });

  afterAll(async () => {
    if (!database?.isInitialized) return;
    await database.query(
      `DELETE FROM share_invites
       WHERE inviter_account_id = ANY($1::text[]) OR invitee_account_id = ANY($1::text[])`,
      [[inviterId, inviteeId]],
    );
    await database.query(
      `DELETE FROM wallet_transactions WHERE account_id = ANY($1::text[])`,
      [[inviterId, inviteeId]],
    );
    await database.query(
      `DELETE FROM accounts WHERE id = ANY($1::text[])`,
      [[inviterId, inviteeId]],
    );
    await database.destroy();
  });

  it('grants the initiated reward only up to the daily limit', async () => {
    const first = await service.create(inviterId, { kind: 'invitation' });
    const second = await service.create(inviterId, { kind: 'invitation' });

    expect(first.initiatedRewardGranted).toBe(true);
    expect(second.initiatedRewardGranted).toBe(false);
    const inviter = await database.getRepository(AccountEntity).findOneByOrFail({ id: inviterId });
    expect(inviter.balanceCents).toBe(500);
  });

  it('rewards both accounts once after a referred first login', async () => {
    const card = await service.create(inviterId, { kind: 'invitation' });
    await service.completeReferral(inviteeId, card.token);
    await service.completeReferral(inviteeId, card.token);

    const inviter = await database.getRepository(AccountEntity).findOneByOrFail({ id: inviterId });
    const invitee = await database.getRepository(AccountEntity).findOneByOrFail({ id: inviteeId });
    expect(inviter.balanceCents).toBe(3500);
    expect(invitee.balanceCents).toBe(3000);
  });

  it('does not reward self-referrals', async () => {
    const before = await database.getRepository(AccountEntity).findOneByOrFail({ id: inviterId });
    const card = await service.create(inviterId, { kind: 'invitation' });
    await service.completeReferral(inviterId, card.token);
    const after = await database.getRepository(AccountEntity).findOneByOrFail({ id: inviterId });
    expect(after.balanceCents).toBe(before.balanceCents);
  });
});
