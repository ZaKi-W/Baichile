import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  AccountStatus,
  AdminOrderStatus,
  AdminRole,
  AdminUserStatus,
  ManagedContentStatus,
} from '@baichile/api-contract';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { AccountEntity } from '../database/entities/account.entity';
import { AdminSessionEntity } from '../database/entities/admin-session.entity';
import { AdminUserEntity } from '../database/entities/admin-user.entity';
import { MenuItemEntity } from '../database/entities/menu-item.entity';
import { StoreEntity } from '../database/entities/store.entity';
import { VirtualOrderEntity } from '../database/entities/virtual-order.entity';
import { WalletTransactionEntity } from '../database/entities/wallet-transaction.entity';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuthService } from './admin-auth.service';
import type { AuthenticatedAdmin } from './admin.types';
import { hashAdminPassword } from './admin.types';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException({ code: 'INVALID_INPUT', message: '请求内容格式不正确' });
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new BadRequestException({ code: 'INVALID_INPUT', message: `${name}格式不正确` });
  }
  return value.trim();
}

function optionalString(value: unknown, name: string, max = 500): string | null {
  if (value === null || value === undefined || value === '') return null;
  return string(value, name, max);
}

function integer(value: unknown, name: string, min = 0): number {
  if (!Number.isInteger(value) || (value as number) < min) {
    throw new BadRequestException({ code: 'INVALID_INPUT', message: `${name}必须是不小于 ${min} 的整数` });
  }
  return value as number;
}

function finite(value: unknown, name: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
    throw new BadRequestException({ code: 'INVALID_INPUT', message: `${name}格式不正确` });
  }
  return value;
}

export function parseAccountUpdate(value: unknown): { nickname?: string | null; status?: AccountStatus } {
  const input = object(value);
  const result: { nickname?: string | null; status?: AccountStatus } = {};
  if ('nickname' in input) result.nickname = optionalString(input.nickname, '昵称', 80);
  if (input.status === 'active' || input.status === 'disabled') result.status = input.status;
  if (!Object.keys(result).length) throw new BadRequestException('没有可更新的用户字段');
  return result;
}

export function parseOrderUpdate(value: unknown): { adminStatus?: AdminOrderStatus; adminNote?: string } {
  const input = object(value);
  const result: { adminStatus?: AdminOrderStatus; adminNote?: string } = {};
  if (['normal', 'following_up', 'resolved'].includes(String(input.adminStatus))) {
    result.adminStatus = input.adminStatus as AdminOrderStatus;
  }
  if (typeof input.adminNote === 'string' && input.adminNote.trim().length <= 1000) {
    result.adminNote = input.adminNote.trim();
  }
  if (!Object.keys(result).length) throw new BadRequestException('没有可更新的订单字段');
  return result;
}

export function parseWalletAdjustment(value: unknown): { amountCents: number; reason: string } {
  const input = object(value);
  if (!Number.isInteger(input.amountCents) || input.amountCents === 0) {
    throw new BadRequestException('调整金额必须是非零整数分');
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < 2 || reason.length > 200) {
    throw new BadRequestException('调整原因长度必须为 2–200 个字符');
  }
  return { amountCents: input.amountCents as number, reason };
}

@Injectable()
export class AdminMutationService {
  constructor(
    @InjectRepository(StoreEntity) private readonly stores: Repository<StoreEntity>,
    @InjectRepository(MenuItemEntity) private readonly menuItems: Repository<MenuItemEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(VirtualOrderEntity) private readonly orders: Repository<VirtualOrderEntity>,
    @InjectRepository(AdminUserEntity) private readonly adminUsers: Repository<AdminUserEntity>,
    @InjectRepository(AdminSessionEntity) private readonly sessions: Repository<AdminSessionEntity>,
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
  ) {}

  async createStore(value: unknown, actor: AuthenticatedAdmin, ipAddress?: string) {
    const input = this.parseStore(value);
    if (await this.stores.existsBy({ id: input.id })) {
      throw new ConflictException({ code: 'STORE_EXISTS', message: '商家 ID 已存在' });
    }
    const row = await this.stores.save(this.stores.create(input));
    await this.audit.record(actor, {
      action: 'store.create', resourceType: 'store', resourceId: row.id, afterData: row, ipAddress,
    });
    return row;
  }

  async updateStore(id: string, value: unknown, actor: AuthenticatedAdmin, ipAddress?: string) {
    const row = await this.stores.findOneBy({ id });
    if (!row) throw new NotFoundException({ code: 'STORE_NOT_FOUND', message: '商家不存在' });
    const before = { ...row };
    const input = object(value);
    const editable = this.parseStore({ ...row, ...input, id });
    const saved = await this.stores.save(this.stores.merge(row, editable));
    await this.audit.record(actor, {
      action: 'store.update', resourceType: 'store', resourceId: id,
      beforeData: before, afterData: saved, ipAddress,
    });
    return saved;
  }

  async createMenuItem(value: unknown, actor: AuthenticatedAdmin, ipAddress?: string) {
    const input = await this.parseMenuItem(value);
    if (await this.menuItems.existsBy({ id: input.id })) {
      throw new ConflictException({ code: 'MENU_ITEM_EXISTS', message: '菜品 ID 已存在' });
    }
    const row = await this.menuItems.save(this.menuItems.create(input));
    await this.audit.record(actor, {
      action: 'menu_item.create', resourceType: 'menu_item', resourceId: row.id, afterData: row, ipAddress,
    });
    return row;
  }

  async updateMenuItem(id: string, value: unknown, actor: AuthenticatedAdmin, ipAddress?: string) {
    const row = await this.menuItems.findOneBy({ id });
    if (!row) throw new NotFoundException({ code: 'MENU_ITEM_NOT_FOUND', message: '菜品不存在' });
    const before = { ...row };
    const input = await this.parseMenuItem({ ...row, ...object(value), id });
    const saved = await this.menuItems.save(this.menuItems.merge(row, input));
    await this.audit.record(actor, {
      action: 'menu_item.update', resourceType: 'menu_item', resourceId: id,
      beforeData: before, afterData: saved, ipAddress,
    });
    return saved;
  }

  async updateAccount(id: string, value: unknown, actor: AuthenticatedAdmin, ipAddress?: string) {
    const row = await this.accounts.findOneBy({ id });
    if (!row) throw new NotFoundException({ code: 'ACCOUNT_NOT_FOUND', message: '用户不存在' });
    const before = { ...row };
    const saved = await this.accounts.save(this.accounts.merge(row, parseAccountUpdate(value)));
    await this.audit.record(actor, {
      action: 'account.update', resourceType: 'account', resourceId: id,
      beforeData: before, afterData: saved, ipAddress,
    });
    return saved;
  }

  async updateOrder(id: string, value: unknown, actor: AuthenticatedAdmin, ipAddress?: string) {
    const row = await this.orders.findOneBy({ id });
    if (!row) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: '订单不存在' });
    const before = { adminStatus: row.adminStatus, adminNote: row.adminNote };
    const saved = await this.orders.save(this.orders.merge(row, parseOrderUpdate(value)));
    await this.audit.record(actor, {
      action: 'order.update', resourceType: 'order', resourceId: id,
      beforeData: before,
      afterData: { adminStatus: saved.adminStatus, adminNote: saved.adminNote },
      ipAddress,
    });
    return saved;
  }

  async adjustWallet(accountId: string, value: unknown, actor: AuthenticatedAdmin, ipAddress?: string) {
    const { amountCents, reason } = parseWalletAdjustment(value);
    return this.dataSource.transaction(async (manager) => {
      const accounts = manager.getRepository(AccountEntity);
      const account = await accounts.findOne({
        where: { id: accountId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!account) throw new NotFoundException({ code: 'ACCOUNT_NOT_FOUND', message: '用户不存在' });
      const beforeBalance = account.balanceCents;
      const nextBalance = beforeBalance + amountCents;
      if (nextBalance < 0) {
        throw new ConflictException({ code: 'INSUFFICIENT_BALANCE', message: '扣减后余额不能小于零' });
      }
      account.balanceCents = nextBalance;
      await accounts.save(account);
      const transaction = await manager.getRepository(WalletTransactionEntity).save({
        id: randomUUID(),
        accountId,
        type: 'admin_adjustment',
        amountCents,
        balanceAfterCents: nextBalance,
        orderId: null,
        description: reason,
        businessDate: null,
      });
      await this.audit.record(actor, {
        action: 'wallet.adjust', resourceType: 'account', resourceId: accountId,
        beforeData: { balanceCents: beforeBalance },
        afterData: { balanceCents: nextBalance, amountCents, reason },
        ipAddress,
      }, manager);
      return { balanceCents: nextBalance, transaction };
    });
  }

  async createAdmin(value: unknown, actor: AuthenticatedAdmin, ipAddress?: string) {
    const input = object(value);
    const role = this.parseRole(input.role);
    const row = await this.auth.createAdmin({
      username: string(input.username, '用户名', 40),
      displayName: string(input.displayName, '显示名称', 80),
      password: string(input.password, '密码', 200),
      role,
    });
    await this.audit.record(actor, {
      action: 'admin.create', resourceType: 'admin_user', resourceId: row.id, afterData: row, ipAddress,
    });
    const { passwordHash: _, ...result } = row;
    return result;
  }

  async updateAdmin(id: string, value: unknown, actor: AuthenticatedAdmin, ipAddress?: string) {
    const row = await this.adminUsers.findOneBy({ id });
    if (!row) throw new NotFoundException({ code: 'ADMIN_NOT_FOUND', message: '管理员不存在' });
    const input = object(value);
    if (id === actor.id && input.status === 'disabled') {
      throw new ConflictException({ code: 'CANNOT_DISABLE_SELF', message: '不能禁用当前账号' });
    }
    const before = { displayName: row.displayName, role: row.role, status: row.status };
    if ('displayName' in input) row.displayName = string(input.displayName, '显示名称', 80);
    if ('role' in input) row.role = this.parseRole(input.role);
    if ('status' in input) row.status = this.parseAdminStatus(input.status);
    const saved = await this.adminUsers.save(row);
    if (saved.status === 'disabled') {
      await this.sessions.update({ adminUserId: id }, { revokedAt: new Date() });
    }
    await this.audit.record(actor, {
      action: 'admin.update', resourceType: 'admin_user', resourceId: id,
      beforeData: before,
      afterData: { displayName: saved.displayName, role: saved.role, status: saved.status },
      ipAddress,
    });
    const { passwordHash: _, ...result } = saved;
    return result;
  }

  async resetAdminPassword(id: string, value: unknown, actor: AuthenticatedAdmin, ipAddress?: string) {
    const row = await this.adminUsers.findOneBy({ id });
    if (!row) throw new NotFoundException({ code: 'ADMIN_NOT_FOUND', message: '管理员不存在' });
    const password = string(object(value).password, '密码', 200);
    if (password.length < 10) throw new BadRequestException('密码至少 10 位');
    row.passwordHash = await hashAdminPassword(password);
    await this.adminUsers.save(row);
    await this.sessions.update({ adminUserId: id }, { revokedAt: new Date() });
    await this.audit.record(actor, {
      action: 'admin.reset_password', resourceType: 'admin_user', resourceId: id, ipAddress,
    });
    return { success: true };
  }

  private parseStore(value: unknown) {
    const input = object(value);
    const status = input.status === 'inactive' ? 'inactive' : 'active';
    return {
      id: string(input.id, '商家 ID', 80),
      categoryId: string(input.categoryId, '分类 ID', 80),
      name: string(input.name, '商家名称', 120),
      description: string(input.description, '商家简介', 1000),
      coverUrl: optionalString(input.coverUrl, '封面地址', 1000),
      tags: Array.isArray(input.tags) ? input.tags.map((item) => string(item, '标签', 30)).slice(0, 20) : [],
      deliveryFeeCents: integer(input.deliveryFeeCents, '配送费'),
      packingFeeCents: integer(input.packingFeeCents, '包装费'),
      minimumOrderCents: integer(input.minimumOrderCents, '起送金额'),
      virtualDeliveryMinutes: integer(input.virtualDeliveryMinutes, '虚拟配送时间', 1),
      monthlySales: integer(input.monthlySales, '月销量'),
      distanceKm: finite(input.distanceKm, '距离'),
      rating: Math.min(5, finite(input.rating, '评分')),
      recentViewers: integer(input.recentViewers, '最近浏览人数'),
      systemHeat: integer(input.systemHeat, '系统热度'),
      sourceType: string(input.sourceType, '来源类型', 30),
      sortOrder: integer(input.sortOrder, '排序'),
      status: status as ManagedContentStatus,
    };
  }

  private async parseMenuItem(value: unknown) {
    const input = object(value);
    const storeId = string(input.storeId, '商家 ID', 80);
    if (!(await this.stores.existsBy({ id: storeId }))) {
      throw new BadRequestException({ code: 'STORE_NOT_FOUND', message: '所属商家不存在' });
    }
    if (!Array.isArray(input.specGroups)) throw new BadRequestException('规格组必须是数组');
    const status = input.status === 'inactive' ? 'inactive' : 'active';
    return {
      id: string(input.id, '菜品 ID', 80),
      storeId,
      categoryId: string(input.categoryId, '分类 ID', 80),
      subCategoryId: optionalString(input.subCategoryId, '子分类 ID', 80),
      name: string(input.name, '菜品名称', 120),
      subtitle: optionalString(input.subtitle, '副标题', 500),
      imageUrl: optionalString(input.imageUrl, '图片地址', 1000),
      basePriceCents: integer(input.basePriceCents, '基础价格'),
      caloriesKcal: integer(input.caloriesKcal, '热量'),
      calorieSource: input.calorieSource ?? {},
      monthlySales: integer(input.monthlySales, '月销量'),
      specGroups: input.specGroups,
      sourceType: string(input.sourceType, '来源类型', 30),
      sortOrder: integer(input.sortOrder, '排序'),
      status: status as ManagedContentStatus,
    };
  }

  private parseRole(value: unknown): AdminRole {
    if (value === 'super_admin' || value === 'operator' || value === 'support') return value;
    throw new BadRequestException('管理员角色不正确');
  }

  private parseAdminStatus(value: unknown): AdminUserStatus {
    if (value === 'active' || value === 'disabled') return value;
    throw new BadRequestException('管理员状态不正确');
  }
}
