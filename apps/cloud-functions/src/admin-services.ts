import { randomBytes, randomUUID } from 'node:crypto';
import type {
  AccountStatus,
  AdminPage,
  AdminPermission,
  AdminRole,
  AdminUserStatus,
  ManagedContentStatus,
} from '@baichile/api-contract';
import { collections } from './collections';
import { refreshStoreSearchText } from './catalog-search';
import type { Database } from './database';
import { badRequest, conflict, forbidden, notFound, unauthorized } from './errors';
import type {
  AccountDoc,
  AdminAuditLogDoc,
  AdminSessionDoc,
  AdminUserDoc,
  MenuItemDoc,
  StoreDoc,
  VirtualOrderDoc,
  WalletTransactionDoc,
} from './models';
import {
  canAdmin,
  hashAdminPassword,
  hashAdminToken,
  ROLE_PERMISSIONS,
  validateAdminPassword,
  verifyAdminPassword,
  type AuthenticatedAdmin,
} from './admin-security';
import type { PageQuery } from './types';
import { shanghaiBusinessDate } from './services';

const SESSION_MS = 8 * 60 * 60 * 1000;

export class AdminCloudServices {
  readonly auth: AdminAuthService;
  readonly audit: AdminAuditService;
  readonly query: AdminQueryService;
  readonly mutation: AdminMutationService;

  constructor(private readonly db: Database) {
    this.auth = new AdminAuthService(db);
    this.audit = new AdminAuditService(db);
    this.query = new AdminQueryService(db);
    this.mutation = new AdminMutationService(db, this.auth, this.audit);
  }
}

export class AdminAuthService {
  constructor(private readonly db: Database) {}

  async login(username: string, password: string) {
    await this.cleanupExpiredSessions();
    await this.ensureBootstrapAdmin();
    const normalized = username.trim().toLowerCase();
    const user = await this.db.collection<AdminUserDoc>(collections.adminUsers).findOne({ username: normalized });
    const valid = user ? await verifyAdminPassword(password, user.passwordHash) : false;
    if (!user || !valid || user.status !== 'active') {
      unauthorized('账号或密码错误', 'ADMIN_LOGIN_FAILED');
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
    const sessionId = randomUUID();
    await this.db.collection<AdminSessionDoc>(collections.adminSessions).insert({
      _id: sessionId,
      id: sessionId,
      adminUserId: user.id,
      tokenHash: hashAdminToken(token),
      expiresAt,
      revokedAt: null,
      createdAt: this.db.now().toISOString(),
    });
    await this.db.collection<AdminUserDoc>(collections.adminUsers).update(user.id, {
      lastLoginAt: this.db.now().toISOString(),
      updatedAt: this.db.now().toISOString(),
    });
    return { accessToken: token, expiresAt, admin: toAdmin(user) };
  }

  private async cleanupExpiredSessions(): Promise<void> {
    const sessions = await this.db.collection<AdminSessionDoc>(collections.adminSessions).list({
      orderBy: [['expiresAt', 'asc']],
      limit: 100,
    });
    const now = Date.now();
    await Promise.all(sessions
      .filter((session) => new Date(session.expiresAt).getTime() <= now || Boolean(session.revokedAt))
      .map((session) => this.db.collection<AdminSessionDoc>(collections.adminSessions).remove(session.id)));
  }

  async resolveToken(token?: string): Promise<AuthenticatedAdmin> {
    const raw = token?.match(/^Bearer\s+(.+)$/i)?.[1] ?? token;
    if (!raw) unauthorized('后台登录已失效', 'ADMIN_UNAUTHORIZED');
    const session = await this.db.collection<AdminSessionDoc>(collections.adminSessions)
      .findOne({ tokenHash: hashAdminToken(raw), revokedAt: null });
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      unauthorized('后台登录已失效', 'ADMIN_UNAUTHORIZED');
    }
    const user = await this.db.collection<AdminUserDoc>(collections.adminUsers).get(session.adminUserId);
    if (!user || user.status !== 'active') unauthorized('后台登录已失效', 'ADMIN_UNAUTHORIZED');
    return toAdmin(user);
  }

  async logout(token?: string): Promise<{ success: true }> {
    const raw = token?.match(/^Bearer\s+(.+)$/i)?.[1] ?? token;
    if (raw) {
      const session = await this.db.collection<AdminSessionDoc>(collections.adminSessions)
        .findOne({ tokenHash: hashAdminToken(raw), revokedAt: null });
      if (session) await this.db.collection<AdminSessionDoc>(collections.adminSessions).update(session.id, { revokedAt: this.db.now().toISOString() });
    }
    return { success: true };
  }

  async createAdmin(input: { username: string; displayName: string; password: string; role: AdminRole }): Promise<AdminUserDoc> {
    validateAdminPassword(input.password);
    const username = input.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) conflict('用户名格式不正确', 'INVALID_USERNAME');
    if (await this.db.collection<AdminUserDoc>(collections.adminUsers).findOne({ username })) {
      conflict('用户名已存在', 'USERNAME_EXISTS');
    }
    const id = randomUUID();
    const now = this.db.now().toISOString();
    const row: AdminUserDoc = {
      _id: id,
      id,
      username,
      displayName: input.displayName.trim() || username,
      passwordHash: await hashAdminPassword(input.password),
      role: input.role,
      status: 'active',
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.collection<AdminUserDoc>(collections.adminUsers).insert(row);
    return row;
  }

  async ensureBootstrapAdmin(): Promise<void> {
    if (await this.db.collection<AdminUserDoc>(collections.adminUsers).count()) return;
    const username = process.env.ADMIN_BOOTSTRAP_USERNAME || '';
    const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || '';
    const displayName = process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME || '开发管理员';
    if (!username || !password) return;
    await this.createAdmin({ username, password, displayName, role: 'super_admin' });
  }
}

export class AdminAuditService {
  constructor(private readonly db: Database) {}

  async record(actor: AuthenticatedAdmin, input: {
    action: string;
    resourceType: string;
    resourceId?: string | null;
    beforeData?: unknown;
    afterData?: unknown;
    ipAddress?: string | null;
  }, db = this.db): Promise<void> {
    const id = randomUUID();
    await db.collection<AdminAuditLogDoc>(collections.adminAuditLogs).insert({
      _id: id,
      id,
      adminUserId: actor.id,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      beforeData: input.beforeData,
      afterData: input.afterData,
      ipAddress: input.ipAddress ?? null,
      createdAt: db.now().toISOString(),
    });
  }
}

export class AdminQueryService {
  constructor(private readonly db: Database) {}

  async dashboard() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [
      stores,
      menuItems,
      accounts,
      orders,
      walletTransactions,
    ] = await Promise.all([
      this.db.collection<StoreDoc>(collections.stores).list(),
      this.db.collection<MenuItemDoc>(collections.menuItems).list(),
      this.db.collection<AccountDoc>(collections.accounts).list(),
      this.db.collection<VirtualOrderDoc>(collections.virtualOrders).list(),
      this.db.collection<WalletTransactionDoc>(collections.walletTransactions).list(),
    ]);
    return {
      stores: { total: stores.length, active: stores.filter((row) => row.status === 'active').length },
      menuItems: { total: menuItems.length, active: menuItems.filter((row) => row.status === 'active').length },
      accounts: { total: accounts.length, today: accounts.filter((row) => new Date(row.createdAt) >= today).length },
      orders: {
        total: orders.length,
        today: orders.filter((row) => new Date(row.createdAt) >= today).length,
        byAdminStatus: groupCount(orders, 'adminStatus'),
      },
      wallet: {
        totalBalanceCents: accounts.reduce((sum, row) => sum + row.balanceCents, 0),
        todayNetCents: walletTransactions
          .filter((row) => new Date(row.createdAt) >= today)
          .reduce((sum, row) => sum + row.amountCents, 0),
      },
    };
  }

  async listStores(query: PageQuery) {
    const rows = await this.db.collection<StoreDoc>(collections.stores).list({ orderBy: [['sortOrder', 'asc'], ['name', 'asc']] });
    return page(filterRows(rows, query, ['name'], ['status', 'categoryId']), query);
  }

  async store(id: string) {
    const row = await this.db.collection<StoreDoc>(collections.stores).get(id);
    if (!row) notFound('商家不存在', 'STORE_NOT_FOUND');
    return row;
  }

  async listMenuItems(storeId: string, query: PageQuery) {
    await this.store(storeId);
    const rows = await this.db.collection<MenuItemDoc>(collections.menuItems).list({ where: { storeId }, orderBy: [['sortOrder', 'asc'], ['name', 'asc']] });
    return page(filterRows(rows, query, ['name'], ['status', 'categoryId']), query);
  }

  async listAccounts(query: PageQuery) {
    const rows = await this.db.collection<AccountDoc>(collections.accounts).list({ orderBy: [['createdAt', 'desc']] });
    return page(filterRows(rows, query, ['id', 'nickname'], ['status']), query);
  }

  async account(id: string) {
    const row = await this.db.collection<AccountDoc>(collections.accounts).get(id);
    if (!row) notFound('用户不存在', 'ACCOUNT_NOT_FOUND');
    const orderCount = await this.db.collection<VirtualOrderDoc>(collections.virtualOrders).count({ accountId: id });
    return { ...row, orderCount };
  }

  async wallet(accountId: string, query: PageQuery) {
    const account = await this.account(accountId);
    const rows = await this.db.collection<WalletTransactionDoc>(collections.walletTransactions).list({
      where: { accountId },
      orderBy: [['createdAt', 'desc']],
    });
    return { account, transactions: page(filterRows(rows, query, ['description'], ['type']), query) };
  }

  async listOrders(query: PageQuery) {
    const rows = await this.db.collection<VirtualOrderDoc>(collections.virtualOrders).list({ orderBy: [['createdAt', 'desc']] });
    return page(filterRows(rows, query, ['id', 'accountId'], ['accountId', 'storeId', 'status', 'adminStatus']), query);
  }

  async order(id: string) {
    const order = await this.db.collection<VirtualOrderDoc>(collections.virtualOrders).get(id);
    if (!order) notFound('订单不存在', 'ORDER_NOT_FOUND');
    const [account, store] = await Promise.all([
      order.accountId ? this.db.collection<AccountDoc>(collections.accounts).get(order.accountId) : null,
      this.db.collection<StoreDoc>(collections.stores).get(order.storeId),
    ]);
    return { ...order, account, store };
  }

  async listAdminUsers(query: PageQuery) {
    const rows = await this.db.collection<AdminUserDoc>(collections.adminUsers).list({ orderBy: [['createdAt', 'desc']] });
    const items = filterRows(rows, query, ['username', 'displayName'], ['status'])
      .map(({ passwordHash: _, ...row }) => row);
    return page(items, query);
  }

  async listAuditLogs(query: PageQuery) {
    const rows = await this.db.collection<AdminAuditLogDoc>(collections.adminAuditLogs).list({ orderBy: [['createdAt', 'desc']] });
    return page(filterRows(rows, query, ['action', 'resourceType', 'resourceId'], ['action', 'resourceType']), query);
  }
}

export class AdminMutationService {
  constructor(
    private readonly db: Database,
    private readonly auth: AdminAuthService,
    private readonly audit: AdminAuditService,
  ) {}

  async saveStore(id: string | undefined, value: unknown, actor: AuthenticatedAdmin, ipAddress?: string | null) {
    const input = parseStore(value);
    const stores = this.db.collection<StoreDoc>(collections.stores);
    const existing = id ? await stores.get(id) : await stores.get(input.id);
    const now = this.db.now().toISOString();
    const row: StoreDoc = { ...existing, ...input, _id: id ?? input.id, id: id ?? input.id, createdAt: existing?.createdAt ?? now, updatedAt: now };
    if (id) await stores.update(id, row);
    else {
      if (existing) conflict('商家 ID 已存在', 'STORE_EXISTS');
      await stores.insert(row);
    }
    const searchable = await refreshStoreSearchText(this.db, row.id) ?? row;
    await this.audit.record(actor, { action: id ? 'store.update' : 'store.create', resourceType: 'store', resourceId: row.id, beforeData: existing, afterData: searchable, ipAddress });
    return searchable;
  }

  async saveMenuItem(storeId: string, id: string | undefined, value: unknown, actor: AuthenticatedAdmin, ipAddress?: string | null) {
    if (!await this.db.collection<StoreDoc>(collections.stores).get(storeId)) notFound('商家不存在', 'STORE_NOT_FOUND');
    const input = parseMenuItem({ ...(value as Record<string, unknown>), storeId });
    const items = this.db.collection<MenuItemDoc>(collections.menuItems);
    const targetId = id ?? input.id;
    const existing = await items.get(targetId);
    const now = this.db.now().toISOString();
    const row: MenuItemDoc = { ...existing, ...input, _id: targetId, id: targetId, createdAt: existing?.createdAt ?? now, updatedAt: now };
    if (id) await items.update(id, row);
    else {
      if (existing) conflict('菜品 ID 已存在', 'MENU_ITEM_EXISTS');
      await items.insert(row);
    }
    await refreshStoreSearchText(this.db, storeId);
    await this.audit.record(actor, { action: id ? 'menu_item.update' : 'menu_item.create', resourceType: 'menu_item', resourceId: row.id, beforeData: existing, afterData: row, ipAddress });
    return row;
  }

  async transferMenuItem(storeId: string, id: string, value: unknown, actor: AuthenticatedAdmin, ipAddress?: string | null) {
    const targetStoreId = stringField(object(value).targetStoreId, '目标商家 ID', 80);
    if (targetStoreId === storeId) badRequest('目标商家不能与当前商家相同', 'SAME_STORE');
    if (!await this.db.collection<StoreDoc>(collections.stores).get(targetStoreId)) notFound('商家不存在', 'STORE_NOT_FOUND');
    const item = await this.db.collection<MenuItemDoc>(collections.menuItems).get(id);
    if (!item || item.storeId !== storeId) notFound('菜品不存在', 'MENU_ITEM_NOT_FOUND');
    const saved = await this.db.collection<MenuItemDoc>(collections.menuItems).update(id, { storeId: targetStoreId, updatedAt: this.db.now().toISOString() });
    await Promise.all([
      refreshStoreSearchText(this.db, storeId),
      refreshStoreSearchText(this.db, targetStoreId),
    ]);
    await this.audit.record(actor, { action: 'menu_item.transfer', resourceType: 'menu_item', resourceId: id, beforeData: { storeId }, afterData: { storeId: targetStoreId }, ipAddress });
    return saved;
  }

  async updateAccount(id: string, value: unknown, actor: AuthenticatedAdmin, ipAddress?: string | null) {
    const row = await this.db.collection<AccountDoc>(collections.accounts).get(id);
    if (!row) notFound('用户不存在', 'ACCOUNT_NOT_FOUND');
    const patch = parseAccountUpdate(value);
    const saved = await this.db.collection<AccountDoc>(collections.accounts).update(id, { ...patch, updatedAt: this.db.now().toISOString() });
    await this.audit.record(actor, { action: 'account.update', resourceType: 'account', resourceId: id, beforeData: row, afterData: saved, ipAddress });
    return saved;
  }

  async adjustWallet(accountId: string, value: unknown, actor: AuthenticatedAdmin, ipAddress?: string | null) {
    const { amountCents, reason } = parseWalletAdjustment(value);
    return this.db.transaction(async (tx) => {
      const accounts = tx.collection<AccountDoc>(collections.accounts);
      const account = await accounts.get(accountId);
      if (!account) notFound('用户不存在', 'ACCOUNT_NOT_FOUND');
      const nextBalance = account.balanceCents + amountCents;
      if (nextBalance < 0) conflict('扣减后余额不能小于零', 'INSUFFICIENT_BALANCE');
      await accounts.update(accountId, { balanceCents: nextBalance, updatedAt: tx.now().toISOString() });
      const id = randomUUID();
      const transaction = await tx.collection<WalletTransactionDoc>(collections.walletTransactions).insert({
        _id: id,
        id,
        accountId,
        type: 'admin_adjustment',
        amountCents,
        balanceAfterCents: nextBalance,
        orderId: null,
        description: reason,
        businessDate: shanghaiBusinessDate(),
        createdAt: tx.now().toISOString(),
      });
      await this.audit.record(actor, { action: 'wallet.adjust', resourceType: 'account', resourceId: accountId, beforeData: { balanceCents: account.balanceCents }, afterData: { balanceCents: nextBalance, amountCents, reason }, ipAddress }, tx);
      return { balanceCents: nextBalance, transaction };
    });
  }

  async updateOrder(id: string, value: unknown, actor: AuthenticatedAdmin, ipAddress?: string | null) {
    const row = await this.db.collection<VirtualOrderDoc>(collections.virtualOrders).get(id);
    if (!row) notFound('订单不存在', 'ORDER_NOT_FOUND');
    const patch = parseOrderUpdate(value);
    const saved = await this.db.collection<VirtualOrderDoc>(collections.virtualOrders).update(id, { ...patch, updatedAt: this.db.now().toISOString() });
    await this.audit.record(actor, { action: 'order.update', resourceType: 'order', resourceId: id, beforeData: { adminStatus: row.adminStatus, adminNote: row.adminNote }, afterData: patch, ipAddress });
    return saved;
  }

  async createAdmin(value: unknown, actor: AuthenticatedAdmin, ipAddress?: string | null) {
    const input = object(value);
    const row = await this.auth.createAdmin({
      username: stringField(input.username, '用户名', 40),
      displayName: stringField(input.displayName, '显示名称', 80),
      password: stringField(input.password, '密码', 200),
      role: parseRole(input.role),
    });
    await this.audit.record(actor, { action: 'admin.create', resourceType: 'admin_user', resourceId: row.id, afterData: row, ipAddress });
    const { passwordHash: _, ...result } = row;
    return result;
  }

  async updateAdmin(id: string, value: unknown, actor: AuthenticatedAdmin, ipAddress?: string | null) {
    const row = await this.db.collection<AdminUserDoc>(collections.adminUsers).get(id);
    if (!row) notFound('管理员不存在', 'ADMIN_NOT_FOUND');
    const input = object(value);
    if (id === actor.id && input.status === 'disabled') conflict('不能禁用当前账号', 'CANNOT_DISABLE_SELF');
    const patch: Partial<AdminUserDoc> = { updatedAt: this.db.now().toISOString() };
    if ('displayName' in input) patch.displayName = stringField(input.displayName, '显示名称', 80);
    if ('role' in input) patch.role = parseRole(input.role);
    if ('status' in input) patch.status = parseAdminStatus(input.status);
    const saved = await this.db.collection<AdminUserDoc>(collections.adminUsers).update(id, patch);
    await this.audit.record(actor, { action: 'admin.update', resourceType: 'admin_user', resourceId: id, beforeData: row, afterData: saved, ipAddress });
    const { passwordHash: _, ...result } = saved;
    return result;
  }

  async resetAdminPassword(id: string, value: unknown, actor: AuthenticatedAdmin, ipAddress?: string | null) {
    const row = await this.db.collection<AdminUserDoc>(collections.adminUsers).get(id);
    if (!row) notFound('管理员不存在', 'ADMIN_NOT_FOUND');
    const password = stringField(object(value).password, '密码', 200);
    validateAdminPassword(password);
    await this.db.collection<AdminUserDoc>(collections.adminUsers).update(id, {
      passwordHash: await hashAdminPassword(password),
      updatedAt: this.db.now().toISOString(),
    });
    const sessions = await this.db.collection<AdminSessionDoc>(collections.adminSessions).list({ where: { adminUserId: id, revokedAt: null } });
    await Promise.all(sessions.map((session) => this.db.collection<AdminSessionDoc>(collections.adminSessions).update(session.id, { revokedAt: this.db.now().toISOString() })));
    await this.audit.record(actor, { action: 'admin.reset_password', resourceType: 'admin_user', resourceId: id, ipAddress });
    return { success: true };
  }
}

export async function requireAdmin(
  services: AdminCloudServices,
  authorization: string | undefined,
  permission: AdminPermission,
): Promise<AuthenticatedAdmin> {
  const admin = await services.auth.resolveToken(authorization);
  if (!canAdmin(admin.role, permission)) forbidden();
  return admin;
}

function toAdmin(user: AdminUserDoc): AuthenticatedAdmin {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    permissions: ROLE_PERMISSIONS[user.role],
  };
}

function page<T>(rows: T[], query: PageQuery): AdminPage<T> {
  const rawPage = Number.parseInt(query.page ?? '', 10);
  const rawSize = Number.parseInt(query.pageSize ?? '', 10);
  const pageNumber = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Math.min(100, Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 20);
  const start = (pageNumber - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), total: rows.length, page: pageNumber, pageSize };
}

function filterRows<T extends Record<string, any>>(
  rows: T[],
  query: PageQuery,
  keywordFields: string[],
  exactFields: string[],
): T[] {
  const keyword = query.keyword?.trim().slice(0, 100).toLowerCase();
  if (query.dateFrom && !isIsoDate(query.dateFrom)) badRequest('开始日期格式不正确', 'INVALID_QUERY');
  if (query.dateTo && !isIsoDate(query.dateTo)) badRequest('结束日期格式不正确', 'INVALID_QUERY');
  return rows.filter((row) => {
    if (keyword && !keywordFields.some((field) => String(row[field] ?? '').toLowerCase().includes(keyword))) return false;
    for (const field of exactFields) {
      const value = query[field as keyof PageQuery];
      if (value && row[field] !== value) return false;
    }
    if (query.dateFrom && row.createdAt < query.dateFrom) return false;
    if (query.dateTo && row.createdAt > query.dateTo) return false;
    return true;
  });
}

function groupCount<T extends Record<string, any>>(rows: T[], field: string): Record<string, number> {
  return rows.reduce<Record<string, number>>((result, row) => {
    const key = String(row[field] ?? '');
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) badRequest('请求内容格式不正确', 'INVALID_INPUT');
  return value as Record<string, unknown>;
}

function stringField(value: unknown, name: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) badRequest(`${name}格式不正确`, 'INVALID_INPUT');
  return value.trim();
}

function optionalString(value: unknown, name: string, max = 500): string | null {
  if (value === null || value === undefined || value === '') return null;
  return stringField(value, name, max);
}

function integer(value: unknown, name: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) badRequest(`${name}必须是 ${min}–${max} 范围内的整数`, 'INVALID_INPUT');
  return value as number;
}

function finite(value: unknown, name: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) badRequest(`${name}格式不正确`, 'INVALID_INPUT');
  return value;
}

function parseStore(value: unknown): Omit<StoreDoc, '_id' | 'createdAt' | 'updatedAt'> {
  const input = object(value);
  const status = input.status === 'inactive' ? 'inactive' : 'active';
  const id = stringField(input.id, '商家 ID', 80);
  return {
    id,
    categoryId: stringField(input.categoryId, '分类 ID', 80),
    name: stringField(input.name, '商家名称', 120),
    description: stringField(input.description, '商家简介', 1000),
    coverUrl: optionalString(input.coverUrl, '封面地址', 1000),
    tags: Array.isArray(input.tags) ? input.tags.map((item) => stringField(item, '标签', 30)).slice(0, 20) : [],
    deliveryFeeCents: integer(input.deliveryFeeCents, '配送费', 0, 100_000),
    packingFeeCents: integer(input.packingFeeCents, '包装费', 0, 100_000),
    minimumOrderCents: integer(input.minimumOrderCents, '起送金额', 0, 10_000_000),
    virtualDeliveryMinutes: integer(input.virtualDeliveryMinutes, '虚拟配送时间', 1, 24 * 60),
    monthlySales: integer(input.monthlySales, '月销量', 0, 100_000_000),
    distanceKm: finite(input.distanceKm, '距离', 0, 10_000),
    rating: finite(input.rating, '评分', 0, 5),
    recentViewers: integer(input.recentViewers, '最近浏览人数', 0, 100_000_000),
    systemHeat: integer(input.systemHeat, '系统热度', 0, 100_000_000),
    sourceType: stringField(input.sourceType, '来源类型', 30),
    sortOrder: integer(input.sortOrder, '排序'),
    status: status as ManagedContentStatus,
  };
}

function parseMenuItem(value: unknown): Omit<MenuItemDoc, '_id' | 'createdAt' | 'updatedAt'> {
  const input = object(value);
  if (!Array.isArray(input.specGroups)) badRequest('规格组必须是数组');
  const id = stringField(input.id, '菜品 ID', 80);
  const status = input.status === 'inactive' ? 'inactive' : 'active';
  return {
    id,
    storeId: stringField(input.storeId, '商家 ID', 80),
    categoryId: stringField(input.categoryId, '分类 ID', 80),
    subCategoryId: optionalString(input.subCategoryId, '子分类 ID', 80),
    name: stringField(input.name, '菜品名称', 120),
    subtitle: optionalString(input.subtitle, '副标题', 500),
    imageUrl: optionalString(input.imageUrl, '图片地址', 1000),
    basePriceCents: integer(input.basePriceCents, '基础价格', 0, 10_000_000),
    caloriesKcal: integer(input.caloriesKcal, '热量', 0, 100_000),
    calorieSource: safeStructuredValue(input.calorieSource ?? {}, '热量来源', 16_384),
    monthlySales: integer(input.monthlySales, '月销量', 0, 100_000_000),
    specGroups: safeStructuredValue(input.specGroups, '规格组', 65_536) as unknown[],
    sourceType: stringField(input.sourceType, '来源类型', 30),
    sortOrder: integer(input.sortOrder, '排序'),
    status: status as ManagedContentStatus,
  };
}

function parseAccountUpdate(value: unknown): { nickname?: string | null; status?: AccountStatus } {
  const input = object(value);
  const result: { nickname?: string | null; status?: AccountStatus } = {};
  if ('nickname' in input) result.nickname = optionalString(input.nickname, '昵称', 80);
  if (input.status === 'active' || input.status === 'disabled') result.status = input.status;
  if (!Object.keys(result).length) badRequest('没有可更新的用户字段');
  return result;
}

function parseOrderUpdate(value: unknown): Pick<VirtualOrderDoc, 'adminStatus' | 'adminNote'> {
  const input = object(value);
  const result: Partial<Pick<VirtualOrderDoc, 'adminStatus' | 'adminNote'>> = {};
  if (['normal', 'following_up', 'resolved'].includes(String(input.adminStatus))) result.adminStatus = input.adminStatus as VirtualOrderDoc['adminStatus'];
  if (typeof input.adminNote === 'string' && input.adminNote.trim().length <= 1000) result.adminNote = input.adminNote.trim();
  if (!Object.keys(result).length) badRequest('没有可更新的订单字段');
  return result as Pick<VirtualOrderDoc, 'adminStatus' | 'adminNote'>;
}

function parseWalletAdjustment(value: unknown): { amountCents: number; reason: string } {
  const input = object(value);
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents === 0 || Math.abs(input.amountCents as number) > 10_000_000) {
    badRequest('调整金额必须是绝对值不超过 10000000 的非零整数分');
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < 2 || reason.length > 200) badRequest('调整原因长度必须为 2–200 个字符');
  return { amountCents: input.amountCents as number, reason };
}

function parseRole(value: unknown): AdminRole {
  if (value === 'super_admin' || value === 'operator' || value === 'support') return value;
  badRequest('管理员角色不正确');
}

function parseAdminStatus(value: unknown): AdminUserStatus {
  if (value === 'active' || value === 'disabled') return value;
  badRequest('管理员状态不正确');
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && Number.isFinite(new Date(value).getTime());
}

function safeStructuredValue(value: unknown, name: string, maxBytes: number): unknown {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    badRequest(`${name}格式不正确`, 'INVALID_INPUT');
  }
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > maxBytes || /"(?:__proto__|prototype|constructor)"\s*:/.test(serialized)) {
    badRequest(`${name}格式不正确或内容过大`, 'INVALID_INPUT');
  }
  return JSON.parse(serialized) as unknown;
}
