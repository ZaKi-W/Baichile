import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ShareCard,
  ShareCreateRequest,
  ShareLanding,
  ShareRewardConfig,
  WalletTransactionType,
} from '@baichile/api-contract';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AccountEntity } from '../database/entities/account.entity';
import { ShareConfigEntity } from '../database/entities/share-config.entity';
import { ShareInviteEntity } from '../database/entities/share-invite.entity';
import { VirtualOrderEntity } from '../database/entities/virtual-order.entity';
import { WalletTransactionEntity } from '../database/entities/wallet-transaction.entity';
import { shanghaiBusinessDate } from '../wallet.service';
import {
  buildSharePath,
  chooseShareTitle,
  DEFAULT_SHARE_REWARD_CONFIG,
  parseShareRewardConfig,
} from './share-domain';

const BENEFIT_TEXT = '好友第一次来围观，双方各领虚拟饭钱——不能提现，但真能在这里花。';

@Injectable()
export class ShareService {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async config(manager: EntityManager = this.dataSource.manager): Promise<ShareRewardConfig> {
    const row = await manager.getRepository(ShareConfigEntity).findOneBy({ id: 'default' });
    return row?.config ?? DEFAULT_SHARE_REWARD_CONFIG;
  }

  async updateConfig(value: unknown, manager?: EntityManager): Promise<ShareRewardConfig> {
    const config = parseShareRewardConfig(value);
    const repository = (manager ?? this.dataSource.manager).getRepository(ShareConfigEntity);
    await repository.save(repository.create({ id: 'default', config }));
    return config;
  }

  async create(accountId: string, input: ShareCreateRequest): Promise<ShareCard> {
    if (!['order', 'achievement', 'invitation'].includes(input?.kind)) {
      throw new BadRequestException({ code: 'INVALID_SHARE_KIND', message: '分享类型不正确' });
    }
    return this.dataSource.transaction(async (manager) => {
      const config = await this.config(manager);
      if (!config.enabled) throw new BadRequestException({ code: 'SHARE_DISABLED', message: '分享活动暂未开放' });
      const snapshot = await this.snapshot(manager, accountId, input);
      const token = randomUUID();
      const titles = input.kind === 'order'
        ? config.orderTitles
        : input.kind === 'achievement' ? config.achievementTitles : config.invitationTitles;
      const title = chooseShareTitle(titles, input.orderId ?? `${accountId}:${shanghaiBusinessDate()}`)
        .replace('{count}', String(snapshot.completedOrderCount));
      const invite = manager.getRepository(ShareInviteEntity).create({
        token,
        inviterAccountId: accountId,
        kind: input.kind,
        orderId: input.orderId ?? null,
        title,
        snapshot,
        inviteeAccountId: null,
        completedAt: null,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        initiatedRewardGranted: false,
      });
      await manager.save(invite);
      const account = await manager.getRepository(AccountEntity).findOneOrFail({
        where: { id: accountId },
        lock: { mode: 'pessimistic_write' },
      });
      const grantedToday = await manager.getRepository(ShareInviteEntity)
        .createQueryBuilder('invite')
        .where('invite.inviter_account_id = :accountId', { accountId })
        .andWhere('invite.initiated_reward_granted = true')
        .andWhere('invite.created_at >= :today', { today: `${shanghaiBusinessDate()}T00:00:00+08:00` })
        .getCount();
      const grant = grantedToday < config.dailyInitiatedLimit && config.initiatedRewardCents > 0;
      if (grant) {
        await this.credit(manager, account, config.initiatedRewardCents, 'share_initiated', '发起分享奖励（虚拟饭钱，不可提现）');
        invite.initiatedRewardGranted = true;
        await manager.save(invite);
      }
      return {
        token,
        kind: input.kind,
        title,
        path: buildSharePath(token),
        initiatedRewardCents: grant ? config.initiatedRewardCents : 0,
        initiatedRewardGranted: grant,
      };
    });
  }

  async landing(token: string): Promise<ShareLanding> {
    const config = await this.config();
    const invite = await this.dataSource.getRepository(ShareInviteEntity).findOneBy({ token });
    if (!config.enabled || !invite || invite.expiresAt.getTime() <= Date.now()) {
      return { active: false, dishNames: [], savedMoneyCents: 0, savedCaloriesKcal: 0, completedOrderCount: 0, inviteeRewardCents: 0, benefitText: BENEFIT_TEXT };
    }
    return {
      active: true,
      kind: invite.kind,
      title: invite.title,
      ...invite.snapshot,
      inviteeRewardCents: config.inviteeRewardCents,
      benefitText: BENEFIT_TEXT,
    };
  }

  async completeReferral(inviteeAccountId: string, token?: string): Promise<void> {
    if (!token) return;
    await this.dataSource.transaction(async (manager) => {
      const config = await this.config(manager);
      if (!config.enabled) return;
      const invite = await manager.getRepository(ShareInviteEntity).findOne({
        where: { token },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invite || invite.completedAt || invite.expiresAt.getTime() <= Date.now()) return;
      if (invite.inviterAccountId === inviteeAccountId) return;
      const alreadyReferred = await manager.getRepository(ShareInviteEntity)
        .existsBy({ inviteeAccountId });
      if (alreadyReferred) return;
      const ids = [invite.inviterAccountId, inviteeAccountId].sort();
      const locked = new Map<string, AccountEntity>();
      for (const id of ids) {
        const account = await manager.getRepository(AccountEntity).findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (account) locked.set(id, account);
      }
      const inviter = locked.get(invite.inviterAccountId);
      const invitee = locked.get(inviteeAccountId);
      if (!inviter || !invitee) return;
      if (config.inviterRewardCents) {
        await this.credit(manager, inviter, config.inviterRewardCents, 'referral_inviter', '好友首次登录奖励（虚拟饭钱，不可提现）');
      }
      if (config.inviteeRewardCents) {
        await this.credit(manager, invitee, config.inviteeRewardCents, 'referral_invitee', '首次受邀登录奖励（虚拟饭钱，不可提现）');
      }
      invite.inviteeAccountId = inviteeAccountId;
      invite.completedAt = new Date();
      await manager.save(invite);
    });
  }

  private async snapshot(manager: EntityManager, accountId: string, input: ShareCreateRequest) {
    if (input.kind === 'order') {
      if (!input.orderId) throw new BadRequestException({ code: 'ORDER_REQUIRED', message: '请选择要分享的订单' });
      const order = await manager.getRepository(VirtualOrderEntity).findOneBy({ id: input.orderId, accountId });
      if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: '订单不存在' });
      const deliveredAt = new Date(order.startedAt).getTime() + 83_000 + order.durationMs;
      if (order.status === 'failed' || Date.now() < deliveredAt) {
        throw new BadRequestException({ code: 'ORDER_NOT_COMPLETED', message: '订单送达后才能分享' });
      }
      return {
        dishNames: order.lines.slice(0, 3).map((line) => (
          line && typeof line === 'object' && 'name' in line ? String(line.name) : '神秘菜品'
        )),
        savedMoneyCents: order.totalCents,
        savedCaloriesKcal: order.itemsTotalCaloriesKcal,
        completedOrderCount: 1,
      };
    }
    const rows = (await manager.getRepository(VirtualOrderEntity).findBy({ accountId }))
      .filter((order) => (
        order.status !== 'failed'
        && Date.now() >= new Date(order.startedAt).getTime() + 83_000 + order.durationMs
      ));
    return {
      dishNames: [],
      savedMoneyCents: rows.reduce((sum, order) => sum + order.totalCents, 0),
      savedCaloriesKcal: rows.reduce((sum, order) => sum + order.itemsTotalCaloriesKcal, 0),
      completedOrderCount: rows.length,
    };
  }

  private async credit(
    manager: EntityManager,
    account: AccountEntity,
    amountCents: number,
    type: WalletTransactionType,
    description: string,
  ) {
    account.balanceCents += amountCents;
    await manager.save(account);
    await manager.getRepository(WalletTransactionEntity).insert({
      id: randomUUID(),
      accountId: account.id,
      type,
      amountCents,
      balanceAfterCents: account.balanceCents,
      orderId: null,
      description,
      businessDate: shanghaiBusinessDate(),
    });
  }
}
