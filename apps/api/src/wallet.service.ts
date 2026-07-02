import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { WalletSummary, WalletTransaction } from '@baichile/api-contract';
import { DataSource, EntityManager } from 'typeorm';
import { AccountEntity } from './database/entities/account.entity';
import { WalletTransactionEntity } from './database/entities/wallet-transaction.entity';

const INITIAL_GRANT_CENTS = 30_000;
const DAILY_CHECKIN_CENTS = 10_000;
const TEST_CREDIT_CENTS = 100_000;

export function shanghaiBusinessDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

@Injectable()
export class WalletService {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async initializeAccount(accountId: string, existingManager?: EntityManager): Promise<void> {
    const initialize = async (manager: EntityManager) => {
      const account = await this.lockAccount(manager, accountId);
      const transactions = manager.getRepository(WalletTransactionEntity);
      if (await transactions.existsBy({ accountId, type: 'initial_grant' })) return;
      account.balanceCents += INITIAL_GRANT_CENTS;
      await manager.save(account);
      await transactions.insert({
        id: randomUUID(),
        accountId,
        type: 'initial_grant',
        amountCents: INITIAL_GRANT_CENTS,
        balanceAfterCents: account.balanceCents,
        orderId: null,
        description: '初始资金',
        businessDate: null,
      });
    };
    if (existingManager) await initialize(existingManager);
    else await this.dataSource.transaction(initialize);
  }

  async summary(accountId: string): Promise<WalletSummary> {
    await this.initializeAccount(accountId);
    const account = await this.dataSource.getRepository(AccountEntity).findOneByOrFail({ id: accountId });
    return {
      balanceCents: account.balanceCents,
      checkedInToday: await this.hasCheckedIn(accountId),
    };
  }

  async listTransactions(accountId: string): Promise<WalletTransaction[]> {
    await this.initializeAccount(accountId);
    const rows = await this.dataSource.getRepository(WalletTransactionEntity).find({
      where: { accountId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      amountCents: row.amountCents,
      balanceAfterCents: row.balanceAfterCents,
      orderId: row.orderId ?? undefined,
      description: row.description,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async checkIn(accountId: string): Promise<WalletSummary> {
    await this.initializeAccount(accountId);
    const businessDate = shanghaiBusinessDate();
    try {
      return await this.dataSource.transaction(async (manager) => {
        const account = await this.lockAccount(manager, accountId);
        const transactions = manager.getRepository(WalletTransactionEntity);
        if (await transactions.existsBy({ accountId, type: 'daily_checkin', businessDate })) {
          throw this.alreadyCheckedIn();
        }
        account.balanceCents += DAILY_CHECKIN_CENTS;
        await manager.save(account);
        await transactions.insert({
          id: randomUUID(),
          accountId,
          type: 'daily_checkin',
          amountCents: DAILY_CHECKIN_CENTS,
          balanceAfterCents: account.balanceCents,
          orderId: null,
          description: '每日签到',
          businessDate,
        });
        return { balanceCents: account.balanceCents, checkedInToday: true };
      });
    } catch (error) {
      if (error instanceof ConflictException || this.isUniqueViolation(error)) throw this.alreadyCheckedIn();
      throw error;
    }
  }

  async testCredit(accountId: string): Promise<WalletSummary> {
    await this.initializeAccount(accountId);
    return this.credit(accountId, TEST_CREDIT_CENTS, 'test_credit', '测试加钱');
  }

  async debitOrder(manager: EntityManager, accountId: string, amountCents: number, orderId: string): Promise<void> {
    const account = await this.lockAccount(manager, accountId);
    if (account.balanceCents < amountCents) {
      throw new ConflictException({ code: 'INSUFFICIENT_BALANCE', message: '余额不足' });
    }
    account.balanceCents -= amountCents;
    await manager.save(account);
    await manager.getRepository(WalletTransactionEntity).insert({
      id: randomUUID(),
      accountId,
      type: 'order_payment',
      amountCents: -amountCents,
      balanceAfterCents: account.balanceCents,
      orderId,
      description: '外卖消费',
      businessDate: null,
    });
  }

  private async credit(
    accountId: string,
    amountCents: number,
    type: 'test_credit',
    description: string,
  ): Promise<WalletSummary> {
    return this.dataSource.transaction(async (manager) => {
      const account = await this.lockAccount(manager, accountId);
      account.balanceCents += amountCents;
      await manager.save(account);
      await manager.getRepository(WalletTransactionEntity).insert({
        id: randomUUID(),
        accountId,
        type,
        amountCents,
        balanceAfterCents: account.balanceCents,
        orderId: null,
        description,
        businessDate: null,
      });
      return {
        balanceCents: account.balanceCents,
        checkedInToday: await this.hasCheckedIn(accountId, manager),
      };
    });
  }

  private async hasCheckedIn(accountId: string, manager = this.dataSource.manager): Promise<boolean> {
    return manager.getRepository(WalletTransactionEntity).existsBy({
      accountId,
      type: 'daily_checkin',
      businessDate: shanghaiBusinessDate(),
    });
  }

  private async lockAccount(manager: EntityManager, accountId: string): Promise<AccountEntity> {
    return manager.getRepository(AccountEntity).findOneOrFail({
      where: { id: accountId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private alreadyCheckedIn() {
    return new ConflictException({ code: 'ALREADY_CHECKED_IN', message: '今日已签到' });
  }

  private isUniqueViolation(error: unknown): boolean {
    return !!error && typeof error === 'object' && 'code' in error && error.code === '23505';
  }
}
