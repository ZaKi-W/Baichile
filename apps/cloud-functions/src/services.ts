import { createHash, randomUUID } from 'node:crypto';
import type {
  AccountSavings,
  AccountSession,
  Address,
  AdministrativeArea,
  HomeResponse,
  MenuItem,
  OrderDeliveryAddressSnapshot,
  OrderQuote,
  PlaceSuggestion,
  QuoteRequest,
  ShareCard,
  ShareCreateRequest,
  ShareLanding,
  ShareRewardConfig,
  ShareRewardResult,
  StoreDetail,
  StoreSummary,
  UserProfile,
  VirtualOrder,
  WalletSummary,
  WalletTransaction,
  WechatMiniLoginRequest,
  WechatPhoneResult,
} from '@baichile/api-contract';
import type { DeliveryIncidentKey } from '@baichile/domain';
import {
  calculateLineCalories,
  calculateLineTotal,
  calculateOrderTotal,
  getDeliveryIncidentPhase,
  selectDeliveryIncident,
  validateSelections,
} from '@baichile/domain';
import type { DeliveryStatus, GeoPoint, VirtualRoute } from '@baichile/map-core';
import { resolveCatalogImageUrl } from './catalog-images';
import { collections } from './collections';
import type { CollectionStore, Database, ListOptions } from './database';
import { badRequest, conflict, notFound, unauthorized } from './errors';
import type {
  AccountDoc,
  AddressDoc,
  CategoryDoc,
  MenuItemDoc,
  ShareConfigDoc,
  ShareInviteDoc,
  StoreDoc,
  StoreSubCategoryDoc,
  VirtualOrderDoc,
  VisitorSessionDoc,
  WalletTransactionDoc,
} from './models';
import { buildSharePath, chooseShareTitle, DEFAULT_SHARE_REWARD_CONFIG, parseShareRewardConfig } from './share-domain';
import { resolveCloudFileUrls } from './storage';

interface AnalyticsEventDoc {
  _id: string;
  id: string;
  visitorId?: string | null;
  accountId?: string | null;
  eventName: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

const INITIAL_GRANT_CENTS = 100_000;
const DAILY_CHECKIN_CENTS = 10_000;
const BENEFIT_TEXT = '好友第一次来围观，双方各领虚拟饭钱——不能提现，但真能在这里花。';
const CLOUDBASE_PAGE_SIZE = 100;
const ORDER_STEP_TIMES = [0, 2_000, 5_000, 9_000, 14_000, 18_000] as const;
const DELIVERY_START_MS = ORDER_STEP_TIMES.at(-1)!;
const MIN_DELIVERY_DURATION_MS = 45_000;
const MAX_DELIVERY_DURATION_MS = 90_000;
const PAYMENT_METHOD: VirtualOrder['paymentMethod'] = 'virtual_balance';

async function listAll<T extends Record<string, any>>(
  collection: CollectionStore<T>,
  options: Omit<ListOptions, 'skip' | 'limit'> = {},
): Promise<T[]> {
  const rows: T[] = [];
  for (let skip = 0; ; skip += CLOUDBASE_PAGE_SIZE) {
    const page = await collection.list({ ...options, skip, limit: CLOUDBASE_PAGE_SIZE });
    rows.push(...page);
    if (page.length < CLOUDBASE_PAGE_SIZE) return rows;
  }
}

function normalizeDeliveryAddressSnapshot(input: QuoteRequest['deliveryAddressSnapshot']): OrderDeliveryAddressSnapshot | undefined {
  if (!input) return undefined;
  return {
    name: String(input.name ?? '').trim(),
    phone: String(input.phone ?? '').trim(),
    address: String(input.address ?? '').trim(),
    detail: String(input.detail ?? '').trim(),
    tag: String(input.tag ?? '').trim(),
  };
}

function isDeliveryAddressSnapshot(value: unknown): value is OrderDeliveryAddressSnapshot {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<Record<keyof OrderDeliveryAddressSnapshot, unknown>>;
  const keys: Array<keyof OrderDeliveryAddressSnapshot> = ['name', 'phone', 'address', 'detail', 'tag'];
  return keys.every((key) => typeof input[key] === 'string');
}

export class BaichileCloudServices {
  readonly auth: AuthService;
  readonly catalog: CatalogService;
  readonly addresses: AddressService;
  readonly orders: OrderService;
  readonly wallet: WalletService;
  readonly shares: ShareService;
  readonly analytics: AnalyticsService;
  readonly map: MapService;

  constructor(readonly db: Database) {
    this.auth = new AuthService(db, this);
    this.catalog = new CatalogService(db);
    this.addresses = new AddressService(db);
    this.wallet = new WalletService(db);
    this.orders = new OrderService(db, this.catalog, this.wallet);
    this.shares = new ShareService(db, this.wallet);
    this.analytics = new AnalyticsService(db, this.auth);
    this.map = new MapService();
  }
}

export class AuthService {
  private wechatAccessToken = '';
  private wechatAccessTokenExpiresAt = 0;

  constructor(private readonly db: Database, private readonly services: BaichileCloudServices) {}

  resolveIdentity(authorization?: string): { visitorId?: string; accountId?: string } {
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? authorization;
    if (!token) return {};
    if (token.startsWith('guest.')) return { visitorId: `visitor_${token.slice('guest.'.length)}` };
    if (token.startsWith('account.')) {
      const subject = token.slice('account.'.length);
      return { accountId: `account_${/^[a-f0-9]{64}$/i.test(subject) ? subject.slice(0, 24) : subject}` };
    }
    return {};
  }

  async resolvePersistedIdentity(authorization?: string) {
    const identity = this.resolveIdentity(authorization);
    if (identity.accountId) {
      await this.ensureAccount(identity.accountId);
      const account = await this.db.collection<AccountDoc>(collections.accounts).get(identity.accountId);
      if (account?.status === 'disabled') unauthorized('账号已被禁用', 'ACCOUNT_DISABLED');
    }
    return identity;
  }

  async ensureAccount(accountId: string, patch: Partial<AccountDoc> = {}): Promise<AccountDoc> {
    const accounts = this.db.collection<AccountDoc>(collections.accounts);
    const existing = await accounts.get(accountId);
    if (existing) return existing;
    const now = this.db.now().toISOString();
    const account: AccountDoc = {
      _id: accountId,
      id: accountId,
      wechatOpenIdHash: null,
      nickname: null,
      avatarUrl: null,
      balanceCents: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      ...patch,
    };
    await accounts.insert(account);
    await this.services.wallet.initializeAccount(accountId);
    return (await accounts.get(accountId)) ?? account;
  }

  async createGuest() {
    const id = randomUUID();
    const session = {
      visitorId: `visitor_${id}`,
      accessToken: `guest.${id}`,
      refreshToken: `refresh.${randomUUID()}`,
    };
    const now = this.db.now().toISOString();
    await this.db.collection<VisitorSessionDoc>(collections.visitorSessions).insert({
      _id: session.visitorId,
      id: session.visitorId,
      visitorId: session.visitorId,
      accountId: null,
      createdAt: now,
    });
    return session;
  }

  async loginWechatMini(input: WechatMiniLoginRequest, openId?: string): Promise<AccountSession> {
    const profile = validateProfile(input.profile, input.code);
    const appId = process.env.WECHAT_MINI_APP_ID;
    const appSecret = process.env.WECHAT_MINI_APP_SECRET;
    const resolvedOpenId = openId || await this.resolveWechatOpenId(input.code, appId, appSecret);
    const digest = createHash('sha256').update(resolvedOpenId).digest('hex');
    const accounts = this.db.collection<AccountDoc>(collections.accounts);
    const existing = await accounts.findOne({ wechatOpenIdHash: digest });
    const accountId = existing?.id ?? `account_${digest.slice(0, 24)}`;
    await this.db.transaction(async (tx) => {
      const now = tx.now().toISOString();
      const txAccounts = tx.collection<AccountDoc>(collections.accounts);
      const current = await txAccounts.get(accountId);
      if (current) {
        await txAccounts.update(accountId, { nickname: profile.nickname, avatarUrl: profile.avatarUrl, updatedAt: now });
      } else {
        await txAccounts.insert({
          _id: accountId,
          id: accountId,
          wechatOpenIdHash: digest,
          nickname: profile.nickname,
          avatarUrl: profile.avatarUrl,
          balanceCents: 0,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
      }
      if (input.visitorId) {
        await tx.collection<VisitorSessionDoc>(collections.visitorSessions)
          .upsert(input.visitorId, { id: input.visitorId, visitorId: input.visitorId, accountId, createdAt: now });
      }
      await this.services.wallet.initializeAccount(accountId, tx);
    });
    if (!existing) await this.services.shares.completeReferral(accountId, input.referralToken);
    return { accountId, accessToken: `account.${digest}`, provider: 'wechat', profile };
  }

  async getWechatPhoneNumber(code: string): Promise<WechatPhoneResult> {
    if (!code?.trim()) badRequest('手机号授权凭证不能为空');
    const accessToken = await this.getWechatAccessToken();
    const response = await fetch(
      `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      },
    );
    const body = await response.json() as { errcode?: number; phone_info?: WechatPhoneResult };
    if (!response.ok || body.errcode || !body.phone_info?.phoneNumber) {
      badRequest('微信手机号授权已失效，请重试');
    }
    return body.phone_info;
  }

  async linkVisitorToAccount(visitorId: string, accountId: string, db = this.db): Promise<void> {
    await db.collection<VisitorSessionDoc>(collections.visitorSessions).upsert(visitorId, {
      id: visitorId,
      visitorId,
      accountId,
      createdAt: db.now().toISOString(),
    });
  }

  private async resolveWechatOpenId(code: string, appId?: string, appSecret?: string): Promise<string> {
    if (!appId || !appSecret) {
      if (process.env.NODE_ENV === 'production') badRequest('微信登录配置缺失', 'WECHAT_CONFIG_MISSING');
      return `dev_${code}_${randomUUID()}`;
    }
    const query = new URLSearchParams({ appid: appId, secret: appSecret, js_code: code, grant_type: 'authorization_code' });
    const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${query}`);
    const session = await response.json() as { openid?: string; errcode?: number };
    if (!response.ok || !session.openid || session.errcode) badRequest('微信登录凭证无效');
    return session.openid;
  }

  private async getWechatAccessToken(): Promise<string> {
    if (this.wechatAccessToken && Date.now() < this.wechatAccessTokenExpiresAt) return this.wechatAccessToken;
    const appId = process.env.WECHAT_MINI_APP_ID;
    const appSecret = process.env.WECHAT_MINI_APP_SECRET;
    if (!appId || !appSecret) badRequest('微信手机号能力配置缺失', 'WECHAT_CONFIG_MISSING');
    const response = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credential', appid: appId, secret: appSecret, force_refresh: false }),
    });
    const body = await response.json() as { access_token?: string; expires_in?: number; errcode?: number };
    if (!response.ok || body.errcode || !body.access_token) badRequest('微信手机号服务暂不可用', 'WECHAT_PHONE_UNAVAILABLE');
    this.wechatAccessToken = body.access_token;
    this.wechatAccessTokenExpiresAt = Date.now() + Math.max(60, (body.expires_in ?? 7200) - 300) * 1000;
    return this.wechatAccessToken;
  }
}

export class CatalogService {
  constructor(private readonly db: Database) {}

  async home(): Promise<HomeResponse> {
    const [categories, storeRows] = await Promise.all([
      listAll(this.db.collection<CategoryDoc>(collections.categories), { orderBy: [['sortOrder', 'asc']] }),
      listAll(this.db.collection<StoreDoc>(collections.stores), {
        where: { status: 'active' },
        orderBy: [['sortOrder', 'asc']],
      }),
    ]);
    const imageUrls = await resolveCloudFileUrls(storeRows.map((row) => row.coverUrl));
    const stores = storeRows.map((row) => toStoreSummary(row, imageUrls));
    return {
      categories: categories.map(({ id, name, icon }) => ({ id, name, icon })),
      featured: stores.slice(0, 3),
      stores,
      nextCursor: null,
    };
  }

  async list(categoryId?: string, query?: string): Promise<StoreDetail[]> {
    const stores = await listAll(this.db.collection<StoreDoc>(collections.stores), {
      where: { ...(categoryId ? { categoryId } : {}), status: 'active' },
      orderBy: [['sortOrder', 'asc']],
    });
    const details = await this.assemble(stores);
    const normalized = query?.trim().toLowerCase();
    return normalized
      ? details.filter((store) => store.name.toLowerCase().includes(normalized)
        || store.menu.some((item) => item.name.toLowerCase().includes(normalized)))
      : details;
  }

  async find(storeId: string): Promise<StoreDetail> {
    const store = await this.db.collection<StoreDoc>(collections.stores).findOne({ id: storeId, status: 'active' });
    if (!store) notFound('店铺不存在', 'STORE_NOT_FOUND');
    return (await this.assemble([store]))[0];
  }

  private async assemble(rows: StoreDoc[]): Promise<StoreDetail[]> {
    const singleStoreId = rows.length === 1 ? rows[0]?.id : undefined;
    const [items, subs] = await Promise.all([
      listAll(this.db.collection<MenuItemDoc>(collections.menuItems), {
        where: { ...(singleStoreId ? { storeId: singleStoreId } : {}), status: 'active' },
        orderBy: [['sortOrder', 'asc']],
      }),
      listAll(this.db.collection<StoreSubCategoryDoc>(collections.storeSubCategories), {
        where: { ...(singleStoreId ? { storeId: singleStoreId } : {}) },
        orderBy: [['sortOrder', 'asc']],
      }),
    ]);
    const imageUrls = await resolveCloudFileUrls([
      ...rows.map((row) => row.coverUrl),
      ...items.map((item) => item.imageUrl),
    ]);
    return rows.map((store) => ({
      id: store.id,
      name: store.name,
      categoryId: store.categoryId,
      description: store.description,
      coverUrl: resolveImageUrl(store.coverUrl, imageUrls),
      tags: store.tags,
      deliveryFeeCents: store.deliveryFeeCents,
      packingFeeCents: store.packingFeeCents,
      minimumOrderCents: store.minimumOrderCents,
      virtualDeliveryMinutes: store.virtualDeliveryMinutes,
      monthlySales: store.monthlySales,
      distanceKm: store.distanceKm,
      rating: store.rating,
      recentViewers: store.recentViewers,
      systemHeat: store.systemHeat,
      sourceType: store.sourceType as StoreDetail['sourceType'],
      menu: items.filter((item) => item.storeId === store.id).map((item) => toMenuItem(item, imageUrls)),
      subCategories: subs.filter((item) => item.storeId === store.id).map((item) => ({ id: item.subCategoryId, name: item.name })),
    }));
  }
}

export class WalletService {
  constructor(private readonly db: Database) {}

  async initializeAccount(accountId: string, db = this.db): Promise<void> {
    await db.transaction(async (tx) => {
      const accounts = tx.collection<AccountDoc>(collections.accounts);
      const account = await accounts.get(accountId);
      if (!account) return;
      const txs = tx.collection<WalletTransactionDoc>(collections.walletTransactions);
      const grants = await txs.list({ where: { accountId, type: 'initial_grant' } });
      const grantedCents = grants.reduce((sum, row) => sum + Math.max(0, row.amountCents), 0);
      const amountCents = Math.max(0, INITIAL_GRANT_CENTS - grantedCents);
      if (!amountCents) return;
      const balanceCents = account.balanceCents + amountCents;
      await accounts.update(accountId, { balanceCents, updatedAt: tx.now().toISOString() });
      await txs.insert(walletTx(tx, accountId, 'initial_grant', amountCents, balanceCents, grantedCents ? '初始资金补足' : '初始资金'));
    });
  }

  async summary(accountId: string): Promise<WalletSummary> {
    await this.initializeAccount(accountId);
    const account = await this.db.collection<AccountDoc>(collections.accounts).get(accountId);
    if (!account) notFound('用户不存在', 'ACCOUNT_NOT_FOUND');
    return { balanceCents: account.balanceCents, checkedInToday: await this.hasCheckedIn(accountId) };
  }

  async listTransactions(accountId: string): Promise<WalletTransaction[]> {
    await this.initializeAccount(accountId);
    const rows = await this.db.collection<WalletTransactionDoc>(collections.walletTransactions).list({
      where: { accountId },
      orderBy: [['createdAt', 'desc']],
      limit: 100,
    });
    return rows.map(toWalletTransaction);
  }

  async checkIn(accountId: string): Promise<WalletSummary> {
    await this.initializeAccount(accountId);
    const businessDate = shanghaiBusinessDate();
    return this.db.transaction(async (tx) => {
      const txs = tx.collection<WalletTransactionDoc>(collections.walletTransactions);
      if (await txs.findOne({ accountId, type: 'daily_checkin', businessDate })) {
        conflict('今日已签到', 'ALREADY_CHECKED_IN');
      }
      const accounts = tx.collection<AccountDoc>(collections.accounts);
      const account = await accounts.get(accountId);
      if (!account) notFound('用户不存在', 'ACCOUNT_NOT_FOUND');
      const balanceCents = account.balanceCents + DAILY_CHECKIN_CENTS;
      await accounts.update(accountId, { balanceCents, updatedAt: tx.now().toISOString() });
      await txs.insert(walletTx(tx, accountId, 'daily_checkin', DAILY_CHECKIN_CENTS, balanceCents, '每日签到', { businessDate }));
      return { balanceCents, checkedInToday: true };
    });
  }

  async credit(accountId: string, amountCents: number, type: WalletTransactionDoc['type'], description: string, db = this.db): Promise<WalletSummary> {
    return db.transaction(async (tx) => {
      const accounts = tx.collection<AccountDoc>(collections.accounts);
      const account = await accounts.get(accountId);
      if (!account) notFound('用户不存在', 'ACCOUNT_NOT_FOUND');
      const balanceCents = account.balanceCents + amountCents;
      if (balanceCents < 0) conflict('余额不足', 'INSUFFICIENT_BALANCE');
      await accounts.update(accountId, { balanceCents, updatedAt: tx.now().toISOString() });
      await tx.collection<WalletTransactionDoc>(collections.walletTransactions)
        .insert(walletTx(tx, accountId, type, amountCents, balanceCents, description));
      return { balanceCents, checkedInToday: await this.hasCheckedIn(accountId, tx) };
    });
  }

  async debitOrder(db: Database, accountId: string, amountCents: number, orderId: string): Promise<void> {
    const accounts = db.collection<AccountDoc>(collections.accounts);
    const account = await accounts.get(accountId);
    if (!account) notFound('用户不存在', 'ACCOUNT_NOT_FOUND');
    if (account.balanceCents < amountCents) conflict('余额不足', 'INSUFFICIENT_BALANCE');
    const balanceCents = account.balanceCents - amountCents;
    await accounts.update(accountId, { balanceCents, updatedAt: db.now().toISOString() });
    await db.collection<WalletTransactionDoc>(collections.walletTransactions)
      .insert(walletTx(db, accountId, 'order_payment', -amountCents, balanceCents, '外卖消费', { orderId }));
  }

  async hasCheckedIn(accountId: string, db = this.db): Promise<boolean> {
    return Boolean(await db.collection<WalletTransactionDoc>(collections.walletTransactions)
      .findOne({ accountId, type: 'daily_checkin', businessDate: shanghaiBusinessDate() }));
  }
}

export class OrderService {
  constructor(private readonly db: Database, private readonly catalog: CatalogService, private readonly wallet: WalletService) {}

  async quote(request: QuoteRequest): Promise<OrderQuote> {
    if (!request.lines?.length) badRequest('购物车不能为空');
    const store = await this.catalog.find(request.storeId);
    const lines = request.lines.map((input) => {
      const item = store.menu.find((menuItem) => menuItem.id === input.menuItemId);
      if (!item) badRequest('菜品不存在或不属于该店铺');
      const validation = validateSelections(item.specGroups, input.optionIds);
      if (!validation.valid) badRequest(validation.message);
      const options = item.specGroups.flatMap((group) => group.options).filter((option) => input.optionIds.includes(option.id));
      const unitPriceCents = item.basePriceCents + options.reduce((sum, option) => sum + option.priceDeltaCents, 0);
      const unitCaloriesKcal = calculateLineCalories(item.caloriesKcal, options.map((option) => option.calorieDeltaKcal), 1);
      return {
        menuItemId: item.id,
        name: item.name,
        imageUrl: item.imageUrl,
        optionNames: options.map((option) => option.name),
        quantity: input.quantity,
        unitPriceCents,
        totalCents: calculateLineTotal(item.basePriceCents, options.map((option) => option.priceDeltaCents), input.quantity),
        unitCaloriesKcal,
        totalCaloriesKcal: unitCaloriesKcal * input.quantity,
      };
    });
    const itemsTotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
    const itemsTotalCaloriesKcal = lines.reduce((sum, line) => sum + line.totalCaloriesKcal, 0);
    return {
      storeId: store.id,
      lines,
      itemsTotalCents,
      deliveryFeeCents: store.deliveryFeeCents,
      packingFeeCents: store.packingFeeCents,
      totalCents: calculateOrderTotal(lines.map((line) => line.totalCents), store.deliveryFeeCents, store.packingFeeCents),
      itemsTotalCaloriesKcal,
    };
  }

  async create(request: QuoteRequest, accountId: string): Promise<VirtualOrder> {
    await this.wallet.initializeAccount(accountId);
    const quote = await this.quote(request);
    const store = await this.catalog.find(request.storeId);
    const id = randomUUID();
    const startedAt = this.db.now();
    const incident = selectDeliveryIncident(id.slice(0, 8), store.virtualDeliveryMinutes, startedAt.getTime());
    const route = this.route(id, request.virtualDestinationPoint);
    const deliveryAddress = normalizeDeliveryAddressSnapshot(request.deliveryAddressSnapshot);
    const createdAt = startedAt.toISOString();
    const order: VirtualOrder = {
      ...quote,
      id,
      isVirtual: true,
      accountId,
      virtualDestinationId: request.virtualDestinationId,
      storeName: store.name,
      deliveryAddress,
      paymentMethod: PAYMENT_METHOD,
      status: 'created',
      startedAt: createdAt,
      createdAt,
      durationMs: virtualDeliveryDurationMs(store.virtualDeliveryMinutes, id),
      seed: id.slice(0, 8),
      route,
      incident,
      failedAt: incident?.failedAt,
      refundStatus: incident ? 'pending' : undefined,
    };
    await this.db.transaction(async (tx) => {
      const now = tx.now().toISOString();
      await tx.collection<VirtualOrderDoc>(collections.virtualOrders).insert({
        _id: id,
        id,
        visitorId: null,
        accountId,
        status: order.status,
        storeId: order.storeId,
        storeName: order.storeName,
        destinationId: order.virtualDestinationId,
        deliveryAddress: order.deliveryAddress,
        paymentMethod: order.paymentMethod,
        startedAt: order.startedAt,
        durationMs: order.durationMs,
        seed: order.seed,
        itemsTotalCents: order.itemsTotalCents,
        deliveryFeeCents: order.deliveryFeeCents,
        packingFeeCents: order.packingFeeCents,
        totalCents: order.totalCents,
        itemsTotalCaloriesKcal: order.itemsTotalCaloriesKcal,
        lines: order.lines,
        route: order.route,
        incidentKey: incident?.key ?? null,
        incidentStartedAt: incident?.startedAt ?? null,
        failedAt: incident?.failedAt ?? null,
        refundedAt: null,
        adminStatus: 'normal',
        adminNote: '',
        createdAt: order.createdAt,
        updatedAt: now,
      });
      await this.wallet.debitOrder(tx, accountId, order.totalCents, id);
    });
    return order;
  }

  async find(id: string, identity: { visitorId?: string; accountId?: string } = {}): Promise<VirtualOrder> {
    await this.settleFailedOrders(undefined, id);
    const row = await this.db.collection<VirtualOrderDoc>(collections.virtualOrders).get(id);
    if (!row) notFound('订单不存在', 'ORDER_NOT_FOUND');
    const canRead = (identity.accountId && row.accountId === identity.accountId)
      || (identity.visitorId && row.visitorId === identity.visitorId);
    if (!canRead) unauthorized();
    return this.toOrder(row);
  }

  async list(visitorId?: string, accountId?: string): Promise<VirtualOrder[]> {
    if (!visitorId && !accountId) return [];
    await this.settleFailedOrders(accountId);
    const rows = await this.db.collection<VirtualOrderDoc>(collections.virtualOrders).list({
      where: accountId ? { accountId } : { visitorId },
      orderBy: [['createdAt', 'desc']],
    });
    return rows.map((row) => this.toOrder(row));
  }

  async merge(visitorId: string, accountId: string, db = this.db): Promise<{ merged: number }> {
    const orders = db.collection<VirtualOrderDoc>(collections.virtualOrders);
    const rows = await orders.list({ where: { visitorId } });
    await Promise.all(rows.map((row) => orders.update(row.id, { visitorId: null, accountId, updatedAt: db.now().toISOString() })));
    return { merged: rows.length };
  }

  async savings(accountId?: string): Promise<AccountSavings> {
    if (!accountId) return { savedMoneyCents: 0, savedCaloriesKcal: 0, completedOrderCount: 0 };
    await this.settleFailedOrders(accountId);
    const rows = await this.db.collection<VirtualOrderDoc>(collections.virtualOrders).list({ where: { accountId } });
    return rows.reduce<AccountSavings>((summary, row) => {
      if (this.currentStatus(row) !== 'completed') return summary;
      summary.savedMoneyCents += row.totalCents;
      summary.savedCaloriesKcal += row.itemsTotalCaloriesKcal;
      summary.completedOrderCount += 1;
      return summary;
    }, { savedMoneyCents: 0, savedCaloriesKcal: 0, completedOrderCount: 0 });
  }

  async settleFailedOrders(accountId?: string, orderId?: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const orders = tx.collection<VirtualOrderDoc>(collections.virtualOrders);
      const rows = await orders.list({ where: accountId ? { accountId } : {} });
      const due = rows.filter((row) => row.failedAt && !row.refundedAt
        && new Date(row.failedAt).getTime() <= Date.now()
        && (!orderId || row.id === orderId));
      for (const order of due) {
        if (!order.accountId) continue;
        const account = await tx.collection<AccountDoc>(collections.accounts).get(order.accountId);
        if (!account) continue;
        if (await tx.collection<WalletTransactionDoc>(collections.walletTransactions)
          .findOne({ orderId: order.id, type: 'order_refund' })) continue;
        const balanceCents = account.balanceCents + order.totalCents;
        await tx.collection<AccountDoc>(collections.accounts).update(account.id, { balanceCents, updatedAt: tx.now().toISOString() });
        await tx.collection<WalletTransactionDoc>(collections.walletTransactions)
          .insert(walletTx(tx, account.id, 'order_refund', order.totalCents, balanceCents, '配送失败退款', { orderId: order.id }));
        await orders.update(order.id, { status: 'failed', refundedAt: tx.now().toISOString(), updatedAt: tx.now().toISOString() });
      }
    });
  }

  private toOrder(row: VirtualOrderDoc): VirtualOrder {
    const incident = row.incidentKey && row.incidentStartedAt && row.failedAt ? {
      key: row.incidentKey as DeliveryIncidentKey,
      startedAt: row.incidentStartedAt,
      failedAt: row.failedAt,
    } : undefined;
    return {
      id: row.id,
      isVirtual: true,
      visitorId: row.visitorId ?? 'anonymous',
      accountId: row.accountId ?? undefined,
      storeId: row.storeId,
      virtualDestinationId: row.destinationId,
      storeName: row.storeName ?? undefined,
      deliveryAddress: isDeliveryAddressSnapshot(row.deliveryAddress) ? row.deliveryAddress : undefined,
      paymentMethod: PAYMENT_METHOD,
      status: this.currentStatus(row),
      startedAt: row.startedAt,
      createdAt: row.createdAt || row.startedAt,
      durationMs: row.durationMs,
      seed: row.seed,
      itemsTotalCents: row.itemsTotalCents,
      deliveryFeeCents: row.deliveryFeeCents,
      packingFeeCents: row.packingFeeCents,
      totalCents: row.totalCents,
      itemsTotalCaloriesKcal: row.itemsTotalCaloriesKcal,
      lines: row.lines as VirtualOrder['lines'],
      route: row.route as VirtualRoute,
      incident,
      failedAt: row.failedAt ?? undefined,
      refundStatus: incident ? (row.refundedAt ? 'refunded' : 'pending') : undefined,
    };
  }

  private currentStatus(row: VirtualOrderDoc): DeliveryStatus {
    if (row.incidentKey && row.incidentStartedAt && row.failedAt) {
      const phase = getDeliveryIncidentPhase({ key: row.incidentKey as DeliveryIncidentKey, startedAt: row.incidentStartedAt, failedAt: row.failedAt });
      if (phase === 'incident' || phase === 'failed') return phase;
    }
    const elapsed = Date.now() - new Date(row.startedAt).getTime();
    if (elapsed >= DELIVERY_START_MS + row.durationMs) return 'completed';
    for (let index = ORDER_STEP_TIMES.length - 1; index >= 0; index -= 1) {
      if (elapsed >= ORDER_STEP_TIMES[index]) return ['created', 'merchant_accepted', 'preparing', 'rider_assigned', 'picked_up', 'delivering'][index] as DeliveryStatus;
    }
    return 'created';
  }

  private route(id: string, requestedDestination?: GeoPoint): VirtualRoute {
    const point = (lat: number, lng: number): GeoPoint => ({ lat, lng, coordSystem: 'gcj02' });
    if (requestedDestination && requestedDestination.coordSystem !== 'gcj02') badRequest('客户端定位必须使用 GCJ-02 坐标');
    const destination = requestedDestination || point(31.2338, 121.4782);
    const seed = Math.abs(id.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0));
    const angle = (seed % 360) * (Math.PI / 180);
    const dist = 0.5 + ((seed % 200) / 100);
    const dLat = (dist * Math.cos(angle)) / 111;
    const dLng = (dist * Math.sin(angle)) / (111 * Math.cos(destination.lat * Math.PI / 180));
    const origin = point(destination.lat + dLat, destination.lng + dLng);
    return {
      id: `route_${id}`,
      cityCode: '310000',
      origin,
      destination,
      polyline: [
        origin,
        point(origin.lat + (destination.lat - origin.lat) * 0.34, origin.lng + (destination.lng - origin.lng) * 0.3),
        point(origin.lat + (destination.lat - origin.lat) * 0.68, origin.lng + (destination.lng - origin.lng) * 0.72),
        destination,
      ],
      routeSource: 'prebuilt',
      label: '虚拟配送路线',
    };
  }
}

export class AddressService {
  constructor(private readonly db: Database) {}

  async list(identity: { visitorId?: string; accountId?: string }): Promise<Address[]> {
    if (!identity.accountId && !identity.visitorId) return [];
    const rows = await this.db.collection<AddressDoc>(collections.addresses).list({
      where: identity.accountId ? { accountId: identity.accountId } : { visitorId: identity.visitorId },
      orderBy: [['createdAt', 'asc']],
    });
    return rows.map(toAddress);
  }

  async save(input: Omit<Address, 'id'> & { id?: string }, identity: { visitorId?: string; accountId?: string }): Promise<Address> {
    if (!identity.accountId && !identity.visitorId) badRequest('请先建立用户身份');
    return this.db.transaction(async (tx) => {
      const addresses = tx.collection<AddressDoc>(collections.addresses);
      const id = input.id || `addr_${randomUUID()}`;
      const existing = await addresses.get(id);
      if (existing && !belongsTo(existing, identity)) badRequest('无权修改该地址');
      const where = identity.accountId ? { accountId: identity.accountId } : { visitorId: identity.visitorId };
      const siblings = await addresses.list({ where });
      const isDefault = input.isDefault || siblings.length === 0;
      if (isDefault) {
        await Promise.all(siblings.map((row) => addresses.update(row.id, { isDefault: false, updatedAt: tx.now().toISOString() })));
      }
      const now = tx.now().toISOString();
      const saved = await addresses.upsert(id, {
        ...existing,
        ...input,
        id,
        visitorId: identity.visitorId ?? null,
        accountId: identity.accountId ?? null,
        isDefault,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      return toAddress(saved);
    });
  }

  async remove(id: string, identity: { visitorId?: string; accountId?: string }) {
    const addresses = this.db.collection<AddressDoc>(collections.addresses);
    const row = await addresses.get(id);
    if (!row || !belongsTo(row, identity)) badRequest('地址不存在');
    await this.db.transaction(async (tx) => {
      const txAddresses = tx.collection<AddressDoc>(collections.addresses);
      await txAddresses.remove(id);
      if (row.isDefault) {
        const where = identity.accountId ? { accountId: identity.accountId } : { visitorId: identity.visitorId };
        const next = (await txAddresses.list({ where, orderBy: [['createdAt', 'asc']], limit: 1 }))[0];
        if (next) await txAddresses.update(next.id, { isDefault: true, updatedAt: tx.now().toISOString() });
      }
    });
    return { removed: true };
  }

  async merge(visitorId: string, accountId: string, db = this.db) {
    const addresses = db.collection<AddressDoc>(collections.addresses);
    const rows = await addresses.list({ where: { visitorId } });
    await Promise.all(rows.map((row) => addresses.update(row.id, { visitorId: null, accountId, updatedAt: db.now().toISOString() })));
    return { merged: rows.length };
  }
}

export class ShareService {
  constructor(private readonly db: Database, private readonly wallet: WalletService) {}

  async config(db = this.db): Promise<ShareRewardConfig> {
    const row = await db.collection<ShareConfigDoc>(collections.shareRewardConfigs).get('default');
    return row?.config ?? DEFAULT_SHARE_REWARD_CONFIG;
  }

  async updateConfig(value: unknown): Promise<ShareRewardConfig> {
    const config = parseShareRewardConfig(value);
    await this.db.collection<ShareConfigDoc>(collections.shareRewardConfigs).upsert('default', {
      id: 'default',
      config,
      updatedAt: this.db.now().toISOString(),
    });
    return config;
  }

  async create(accountId: string, input: ShareCreateRequest): Promise<ShareCard> {
    if (!['order', 'achievement', 'invitation'].includes(input?.kind)) badRequest('分享类型不正确', 'INVALID_SHARE_KIND');
    return this.db.transaction(async (tx) => {
      const config = await this.config(tx);
      if (!config.enabled) badRequest('分享活动暂未开放', 'SHARE_DISABLED');
      const snapshot = await this.snapshot(tx, accountId, input);
      const token = randomUUID();
      const titles = input.kind === 'order' ? config.orderTitles : input.kind === 'achievement' ? config.achievementTitles : config.invitationTitles;
      const title = chooseShareTitle(titles, input.orderId ?? `${accountId}:${shanghaiBusinessDate()}`).replace('{count}', String(snapshot.completedOrderCount));
      await tx.collection<ShareInviteDoc>(collections.shareInvites).insert({
        _id: token,
        token,
        inviterAccountId: accountId,
        kind: input.kind,
        orderId: input.orderId ?? null,
        title,
        snapshot,
        initiatedRewardGranted: false,
        inviteeAccountId: null,
        completedAt: null,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: tx.now().toISOString(),
      });
      return { token, kind: input.kind, title, path: buildSharePath(token), initiatedRewardCents: config.initiatedRewardCents, initiatedRewardGranted: false };
    });
  }

  async rewardInitiatedShare(accountId: string, token: string): Promise<ShareRewardResult> {
    return this.db.transaction(async (tx) => {
      const config = await this.config(tx);
      const invite = await tx.collection<ShareInviteDoc>(collections.shareInvites).get(token);
      const account = await tx.collection<AccountDoc>(collections.accounts).get(accountId);
      if (!account) notFound('用户不存在', 'ACCOUNT_NOT_FOUND');
      if (!config.enabled || !invite || invite.inviterAccountId !== accountId || invite.initiatedRewardGranted || new Date(invite.expiresAt).getTime() <= Date.now()) {
        return { granted: false, amountCents: 0, balanceCents: account.balanceCents };
      }
      const todayStart = `${shanghaiBusinessDate()}T00:00:00+08:00`;
      const grants = (await tx.collection<ShareInviteDoc>(collections.shareInvites).list({ where: { inviterAccountId: accountId } }))
        .filter((row) => row.initiatedRewardGranted && row.createdAt >= todayStart);
      if (grants.length >= config.dailyInitiatedLimit || config.initiatedRewardCents <= 0) {
        return { granted: false, amountCents: 0, balanceCents: account.balanceCents };
      }
      const summary = await this.wallet.credit(accountId, config.initiatedRewardCents, 'share_initiated', '朋友圈分享奖励（虚拟饭钱，不可提现）', tx);
      await tx.collection<ShareInviteDoc>(collections.shareInvites).update(token, { initiatedRewardGranted: true });
      return { granted: true, amountCents: config.initiatedRewardCents, balanceCents: summary.balanceCents };
    });
  }

  async landing(token: string): Promise<ShareLanding> {
    const config = await this.config();
    const invite = await this.db.collection<ShareInviteDoc>(collections.shareInvites).get(token);
    if (!config.enabled || !invite || new Date(invite.expiresAt).getTime() <= Date.now()) {
      return { active: false, dishNames: [], savedMoneyCents: 0, savedCaloriesKcal: 0, completedOrderCount: 0, inviteeRewardCents: 0, benefitText: BENEFIT_TEXT };
    }
    return { active: true, kind: invite.kind, title: invite.title, ...invite.snapshot, inviteeRewardCents: config.inviteeRewardCents, benefitText: BENEFIT_TEXT };
  }

  async completeReferral(inviteeAccountId: string, token?: string): Promise<void> {
    if (!token) return;
    await this.db.transaction(async (tx) => {
      const config = await this.config(tx);
      if (!config.enabled) return;
      const invite = await tx.collection<ShareInviteDoc>(collections.shareInvites).get(token);
      if (!invite || invite.completedAt || new Date(invite.expiresAt).getTime() <= Date.now()) return;
      if (invite.inviterAccountId === inviteeAccountId) return;
      if (await tx.collection<ShareInviteDoc>(collections.shareInvites).findOne({ inviteeAccountId })) return;
      if (config.inviterRewardCents) await this.wallet.credit(invite.inviterAccountId, config.inviterRewardCents, 'referral_inviter', '好友首次登录奖励（虚拟饭钱，不可提现）', tx);
      if (config.inviteeRewardCents) await this.wallet.credit(inviteeAccountId, config.inviteeRewardCents, 'referral_invitee', '首次受邀登录奖励（虚拟饭钱，不可提现）', tx);
      await tx.collection<ShareInviteDoc>(collections.shareInvites).update(token, { inviteeAccountId, completedAt: tx.now().toISOString() });
    });
  }

  private async snapshot(db: Database, accountId: string, input: ShareCreateRequest) {
    const orders = db.collection<VirtualOrderDoc>(collections.virtualOrders);
    if (input.kind === 'order') {
      if (!input.orderId) badRequest('请选择要分享的订单', 'ORDER_REQUIRED');
      const order = await orders.get(input.orderId);
      if (!order || order.accountId !== accountId) notFound('订单不存在', 'ORDER_NOT_FOUND');
      const deliveredAt = new Date(order.startedAt).getTime() + DELIVERY_START_MS + order.durationMs;
      if (order.status === 'failed' || Date.now() < deliveredAt) badRequest('订单送达后才能分享', 'ORDER_NOT_COMPLETED');
      return {
        dishNames: order.lines.slice(0, 3).map((line) => line && typeof line === 'object' && 'name' in line ? String(line.name) : '神秘菜品'),
        savedMoneyCents: order.totalCents,
        savedCaloriesKcal: order.itemsTotalCaloriesKcal,
        completedOrderCount: 1,
      };
    }
    const rows = (await orders.list({ where: { accountId } })).filter((order) => (
      order.status !== 'failed' && Date.now() >= new Date(order.startedAt).getTime() + DELIVERY_START_MS + order.durationMs
    ));
    return {
      dishNames: [],
      savedMoneyCents: rows.reduce((sum, order) => sum + order.totalCents, 0),
      savedCaloriesKcal: rows.reduce((sum, order) => sum + order.itemsTotalCaloriesKcal, 0),
      completedOrderCount: rows.length,
    };
  }
}

function virtualDeliveryDurationMs(minutes: number, seed: string): number {
  const normalized = Math.min(1, Math.max(0, (minutes - 18) / 27));
  const base = MIN_DELIVERY_DURATION_MS + Math.round((MAX_DELIVERY_DURATION_MS - MIN_DELIVERY_DURATION_MS) * normalized);
  const jitter = Math.abs(seed.split('').reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) | 0, 0)) % 8_000;
  return Math.min(MAX_DELIVERY_DURATION_MS, base + jitter);
}

export class AnalyticsService {
  constructor(private readonly db: Database, private readonly auth: AuthService) {}

  async record(body: unknown, authorization?: string) {
    const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const eventName = typeof input.eventName === 'string' ? input.eventName.trim() : '';
    if (!eventName) badRequest('eventName 不能为空');
    const identity = await this.auth.resolvePersistedIdentity(authorization);
    const id = randomUUID();
    await this.db.collection<AnalyticsEventDoc>(collections.analyticsEvents).insert({
      _id: id,
      id,
      visitorId: identity.visitorId ?? null,
      accountId: identity.accountId ?? null,
      eventName,
      payload: input.payload && typeof input.payload === 'object' ? input.payload as Record<string, unknown> : {},
      createdAt: this.db.now().toISOString(),
    });
    return { recorded: true };
  }
}

export class MapService {
  async reverseGeocode(lat: number, lng: number): Promise<AdministrativeArea> {
    const key = requireTencentMapKey();
    const body = await mapGet<{ status: number; message: string; result?: { address?: string; ad_info: { adcode: string }; address_component: { province: string; city: string; district: string } } }>(
      `https://apis.map.qq.com/ws/geocoder/v1/?location=${lat},${lng}&key=${key}&get_poi=0`,
    );
    if (body.status !== 0 || !body.result) badRequest(body.message || '行政区解析失败');
    const { province, city, district } = body.result.address_component;
    const adcode = body.result.ad_info.adcode;
    return { province, city, district, address: body.result.address, adcode, cityCode: `${adcode.slice(0, 4)}00`, districtCode: adcode };
  }

  async nearbyPlaces(lat: number, lng: number): Promise<PlaceSuggestion[]> {
    const key = requireTencentMapKey();
    const params = new URLSearchParams({ keyword: '小区', boundary: `nearby(${lat},${lng},3000)`, page_size: '20', page_index: '1', key });
    return mapPlaces(`https://apis.map.qq.com/ws/place/v1/search/?${params.toString()}`);
  }

  async suggestPlaces(keyword: string, region?: string): Promise<PlaceSuggestion[]> {
    if (!keyword?.trim()) return [];
    const key = requireTencentMapKey();
    const params = new URLSearchParams({ keyword: keyword.trim(), key, page_size: '10' });
    if (region) {
      params.set('region', region);
      params.set('region_fix', '1');
    }
    return mapPlaces(`https://apis.map.qq.com/ws/place/v1/suggestion/?${params.toString()}`);
  }
}

export function shanghaiBusinessDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function walletTx(
  db: Database,
  accountId: string,
  type: WalletTransactionDoc['type'],
  amountCents: number,
  balanceAfterCents: number,
  description: string,
  extras: Partial<WalletTransactionDoc> = {},
): WalletTransactionDoc {
  const id = randomUUID();
  return {
    _id: id,
    id,
    accountId,
    type,
    amountCents,
    balanceAfterCents,
    orderId: null,
    description,
    businessDate: null,
    createdAt: db.now().toISOString(),
    ...extras,
  };
}

function toMenuItem(item: MenuItemDoc, imageUrls?: Map<string, string>): MenuItem {
  return {
    id: item.id,
    storeId: item.storeId,
    categoryId: item.categoryId,
    subCategoryId: item.subCategoryId ?? undefined,
    name: item.name,
    subtitle: item.subtitle ?? undefined,
    imageUrl: resolveImageUrl(item.imageUrl, imageUrls),
    basePriceCents: item.basePriceCents,
    caloriesKcal: item.caloriesKcal,
    calorieSource: item.calorieSource as MenuItem['calorieSource'],
    monthlySales: item.monthlySales,
    specGroups: item.specGroups as MenuItem['specGroups'],
    sourceType: item.sourceType as MenuItem['sourceType'],
  };
}

function toStoreSummary(store: StoreDoc, imageUrls?: Map<string, string>): StoreSummary {
  return {
    id: store.id,
    name: store.name,
    categoryId: store.categoryId,
    description: store.description,
    coverUrl: resolveImageUrl(store.coverUrl, imageUrls),
    tags: store.tags,
    deliveryFeeCents: store.deliveryFeeCents,
    packingFeeCents: store.packingFeeCents,
    minimumOrderCents: store.minimumOrderCents,
    virtualDeliveryMinutes: store.virtualDeliveryMinutes,
    monthlySales: store.monthlySales,
    distanceKm: store.distanceKm,
    rating: store.rating,
    recentViewers: store.recentViewers,
    systemHeat: store.systemHeat,
    sourceType: store.sourceType as StoreSummary['sourceType'],
  };
}

function resolveImageUrl(value: string | null | undefined, imageUrls?: Map<string, string>): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('cloud://')) return imageUrls?.get(value) ?? value;
  return resolveCatalogImageUrl(value) ?? value;
}

function toWalletTransaction(row: WalletTransactionDoc): WalletTransaction {
  return {
    id: row.id,
    type: row.type,
    amountCents: row.amountCents,
    balanceAfterCents: row.balanceAfterCents,
    orderId: row.orderId ?? undefined,
    description: row.description,
    createdAt: row.createdAt,
  };
}

function toAddress(row: AddressDoc): Address {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    detail: row.detail,
    tag: row.tag,
    lat: row.lat,
    lng: row.lng,
    isDefault: row.isDefault,
  };
}

function belongsTo(row: AddressDoc, identity: { visitorId?: string; accountId?: string }) {
  return Boolean((identity.accountId && row.accountId === identity.accountId)
    || (identity.visitorId && row.visitorId === identity.visitorId));
}

function validateProfile(profile: UserProfile | undefined, code: string) {
  const avatarUrl = profile?.avatarUrl?.trim();
  const nickname = profile?.nickname?.trim();
  if (!code?.trim() || !avatarUrl || !nickname || nickname.length > 32) badRequest('登录资料不完整');
  return { avatarUrl, nickname };
}

function requireTencentMapKey(): string {
  const key = process.env.TENCENT_MAP_KEY;
  if (!key) badRequest('尚未配置腾讯位置服务 Key', 'MAP_KEY_MISSING');
  return key;
}

async function mapGet<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json() as T & { message?: string };
  if (!response.ok) badRequest(mapErrorMessage(body));
  return body;
}

async function mapPlaces(url: string): Promise<PlaceSuggestion[]> {
  const body = await mapGet<{
    status: number;
    message: string;
    data?: Array<{
      id: string;
      title: string;
      address: string;
      province: string;
      city: string;
      district: string;
      location: { lat: number; lng: number };
    }>;
  }>(url);
  if (body.status !== 0) badRequest(mapErrorMessage(body));
  return (body.data ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    address: item.address,
    province: item.province,
    city: item.city,
    district: item.district,
    lat: item.location.lat,
    lng: item.location.lng,
  }));
}

function mapErrorMessage(data: unknown): string {
  const message = data && typeof data === 'object' && 'message' in data ? String((data as { message?: unknown }).message ?? '') : '';
  if (/每日调用量已达到上限|quota|limit/i.test(message)) return '地图服务今日额度已用完，请稍后再试';
  return message || '地图服务请求失败';
}
