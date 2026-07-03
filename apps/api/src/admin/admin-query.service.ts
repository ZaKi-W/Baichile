import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { AdminPage } from '@baichile/api-contract';
import { Repository } from 'typeorm';
import { AccountEntity } from '../database/entities/account.entity';
import { AdminAuditLogEntity } from '../database/entities/admin-audit-log.entity';
import { AdminUserEntity } from '../database/entities/admin-user.entity';
import { MenuItemEntity } from '../database/entities/menu-item.entity';
import { StoreEntity } from '../database/entities/store.entity';
import { VirtualOrderEntity } from '../database/entities/virtual-order.entity';
import { WalletTransactionEntity } from '../database/entities/wallet-transaction.entity';

export interface AdminListQuery {
  page?: string;
  pageSize?: string;
  keyword?: string;
  status?: string;
  categoryId?: string;
  storeId?: string;
  accountId?: string;
  type?: string;
  adminStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  action?: string;
  resourceType?: string;
}

export function normalizeAdminPage(query: Pick<AdminListQuery, 'page' | 'pageSize'>) {
  const rawPage = Number.parseInt(query.page ?? '', 10);
  const rawSize = Number.parseInt(query.pageSize ?? '', 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Math.min(100, Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 20);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function pageResult<T>(items: T[], total: number, page: number, pageSize: number): AdminPage<T> {
  return { items, total, page, pageSize };
}

@Injectable()
export class AdminQueryService {
  constructor(
    @InjectRepository(StoreEntity) private readonly stores: Repository<StoreEntity>,
    @InjectRepository(MenuItemEntity) private readonly menuItems: Repository<MenuItemEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(VirtualOrderEntity) private readonly orders: Repository<VirtualOrderEntity>,
    @InjectRepository(WalletTransactionEntity) private readonly walletTransactions: Repository<WalletTransactionEntity>,
    @InjectRepository(AdminUserEntity) private readonly adminUsers: Repository<AdminUserEntity>,
    @InjectRepository(AdminAuditLogEntity) private readonly auditLogs: Repository<AdminAuditLogEntity>,
  ) {}

  async dashboard() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [
      storesTotal, storesActive, menuItemsTotal, menuItemsActive,
      accountsTotal, accountsToday, ordersTotal, ordersToday,
      walletBalanceRaw, walletTodayRaw, orderStatuses,
    ] = await Promise.all([
      this.stores.count(),
      this.stores.countBy({ status: 'active' }),
      this.menuItems.count(),
      this.menuItems.countBy({ status: 'active' }),
      this.accounts.count(),
      this.accounts.createQueryBuilder('account').where('account.created_at >= :today', { today }).getCount(),
      this.orders.count(),
      this.orders.createQueryBuilder('order').where('order.created_at >= :today', { today }).getCount(),
      this.accounts.createQueryBuilder('account').select('COALESCE(SUM(account.balance_cents), 0)', 'total').getRawOne<{ total: string }>(),
      this.walletTransactions.createQueryBuilder('tx')
        .select('COALESCE(SUM(tx.amount_cents), 0)', 'total')
        .where('tx.created_at >= :today', { today })
        .getRawOne<{ total: string }>(),
      this.orders.createQueryBuilder('order')
        .select('order.admin_status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('order.admin_status')
        .getRawMany<{ status: string; count: string }>(),
    ]);
    return {
      stores: { total: storesTotal, active: storesActive },
      menuItems: { total: menuItemsTotal, active: menuItemsActive },
      accounts: { total: accountsTotal, today: accountsToday },
      orders: {
        total: ordersTotal,
        today: ordersToday,
        byAdminStatus: Object.fromEntries(orderStatuses.map(({ status, count }) => [status, Number(count)])),
      },
      wallet: {
        totalBalanceCents: Number(walletBalanceRaw?.total ?? 0),
        todayNetCents: Number(walletTodayRaw?.total ?? 0),
      },
    };
  }

  async listStores(query: AdminListQuery) {
    const { page, pageSize, skip } = normalizeAdminPage(query);
    const builder = this.stores.createQueryBuilder('store');
    if (query.keyword?.trim()) {
      builder.andWhere('store.name ILIKE :keyword', { keyword: `%${query.keyword.trim()}%` });
    }
    if (query.status) builder.andWhere('store.status = :status', { status: query.status });
    if (query.categoryId) builder.andWhere('store.category_id = :categoryId', { categoryId: query.categoryId });
    const [items, total] = await builder.orderBy('store.sort_order', 'ASC')
      .addOrderBy('store.name', 'ASC').skip(skip).take(pageSize).getManyAndCount();
    return pageResult(items, total, page, pageSize);
  }

  async store(id: string) {
    const item = await this.stores.findOneBy({ id });
    if (!item) throw new NotFoundException({ code: 'STORE_NOT_FOUND', message: '商家不存在' });
    return item;
  }

  async listMenuItems(storeId: string, query: AdminListQuery) {
    await this.store(storeId);
    const { page, pageSize, skip } = normalizeAdminPage(query);
    const builder = this.menuItems.createQueryBuilder('item')
      .where('item.store_id = :storeId', { storeId });
    if (query.keyword?.trim()) {
      builder.andWhere('item.name ILIKE :keyword', { keyword: `%${query.keyword.trim()}%` });
    }
    if (query.status) builder.andWhere('item.status = :status', { status: query.status });
    if (query.categoryId) builder.andWhere('item.category_id = :categoryId', { categoryId: query.categoryId });
    const [items, total] = await builder.orderBy('item.sort_order', 'ASC')
      .addOrderBy('item.name', 'ASC').skip(skip).take(pageSize).getManyAndCount();
    return pageResult(items, total, page, pageSize);
  }

  async menuItem(storeId: string, id: string) {
    await this.store(storeId);
    const item = await this.menuItems.findOneBy({ id, storeId });
    if (!item) throw new NotFoundException({ code: 'MENU_ITEM_NOT_FOUND', message: '菜品不存在' });
    return item;
  }

  async listAccounts(query: AdminListQuery) {
    const { page, pageSize, skip } = normalizeAdminPage(query);
    const builder = this.accounts.createQueryBuilder('account');
    if (query.keyword?.trim()) {
      builder.andWhere(
        '(account.id ILIKE :keyword OR account.nickname ILIKE :keyword)',
        { keyword: `%${query.keyword.trim()}%` },
      );
    }
    if (query.status) builder.andWhere('account.status = :status', { status: query.status });
    const [items, total] = await builder.orderBy('account.created_at', 'DESC')
      .skip(skip).take(pageSize).getManyAndCount();
    return pageResult(items, total, page, pageSize);
  }

  async account(id: string) {
    const item = await this.accounts.findOneBy({ id });
    if (!item) throw new NotFoundException({ code: 'ACCOUNT_NOT_FOUND', message: '用户不存在' });
    const orderCount = await this.orders.countBy({ accountId: id });
    return { ...item, orderCount };
  }

  async wallet(accountId: string, query: AdminListQuery) {
    const account = await this.account(accountId);
    const { page, pageSize, skip } = normalizeAdminPage(query);
    const builder = this.walletTransactions.createQueryBuilder('tx')
      .where('tx.account_id = :accountId', { accountId });
    if (query.type) builder.andWhere('tx.type = :type', { type: query.type });
    this.applyDateRange(builder, 'tx.created_at', query);
    const [transactions, total] = await builder.orderBy('tx.created_at', 'DESC')
      .skip(skip).take(pageSize).getManyAndCount();
    return { account, transactions: pageResult(transactions, total, page, pageSize) };
  }

  async listOrders(query: AdminListQuery) {
    const { page, pageSize, skip } = normalizeAdminPage(query);
    const builder = this.orders.createQueryBuilder('order');
    if (query.keyword?.trim()) {
      builder.andWhere(
        '(CAST(order.id AS text) ILIKE :keyword OR order.account_id ILIKE :keyword)',
        { keyword: `%${query.keyword.trim()}%` },
      );
    }
    if (query.accountId) builder.andWhere('order.account_id = :accountId', { accountId: query.accountId });
    if (query.storeId) builder.andWhere('order.store_id = :storeId', { storeId: query.storeId });
    if (query.status) builder.andWhere('order.status = :status', { status: query.status });
    if (query.adminStatus) builder.andWhere('order.admin_status = :adminStatus', { adminStatus: query.adminStatus });
    this.applyDateRange(builder, 'order.created_at', query);
    const [items, total] = await builder.orderBy('order.created_at', 'DESC')
      .skip(skip).take(pageSize).getManyAndCount();
    return pageResult(items, total, page, pageSize);
  }

  async order(id: string) {
    const item = await this.orders.findOneBy({ id });
    if (!item) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: '订单不存在' });
    const [account, store] = await Promise.all([
      item.accountId ? this.accounts.findOneBy({ id: item.accountId }) : null,
      this.stores.findOneBy({ id: item.storeId }),
    ]);
    return { ...item, account, store };
  }

  async listAdminUsers(query: AdminListQuery) {
    const { page, pageSize, skip } = normalizeAdminPage(query);
    const builder = this.adminUsers.createQueryBuilder('admin');
    if (query.keyword?.trim()) {
      builder.andWhere(
        '(admin.username ILIKE :keyword OR admin.display_name ILIKE :keyword)',
        { keyword: `%${query.keyword.trim()}%` },
      );
    }
    if (query.status) builder.andWhere('admin.status = :status', { status: query.status });
    const [rows, total] = await builder.orderBy('admin.created_at', 'DESC')
      .skip(skip).take(pageSize).getManyAndCount();
    const items = rows.map(({ passwordHash: _, ...admin }) => admin);
    return pageResult(items, total, page, pageSize);
  }

  async listAuditLogs(query: AdminListQuery) {
    const { page, pageSize, skip } = normalizeAdminPage(query);
    const builder = this.auditLogs.createQueryBuilder('audit');
    if (query.accountId) builder.andWhere('audit.admin_user_id = :adminId', { adminId: query.accountId });
    if (query.action) builder.andWhere('audit.action = :action', { action: query.action });
    if (query.resourceType) {
      builder.andWhere('audit.resource_type = :resourceType', { resourceType: query.resourceType });
    }
    this.applyDateRange(builder, 'audit.created_at', query);
    const [items, total] = await builder.orderBy('audit.created_at', 'DESC')
      .skip(skip).take(pageSize).getManyAndCount();
    return pageResult(items, total, page, pageSize);
  }

  private applyDateRange(
    builder: { andWhere(sql: string, parameters: Record<string, unknown>): unknown },
    column: string,
    query: AdminListQuery,
  ): void {
    if (query.dateFrom) builder.andWhere(`${column} >= :dateFrom`, { dateFrom: query.dateFrom });
    if (query.dateTo) builder.andWhere(`${column} <= :dateTo`, { dateTo: query.dateTo });
  }
}
