import { createHash, randomUUID } from 'node:crypto';
import type {
  AccountGameStats,
  AccountMergeSummary,
  AccountSavings,
  AccountSession,
  Address,
  AdministrativeArea,
  CheckoutQuote,
  CheckoutQuoteRequest,
  CheckoutStoreQuote,
  CursorPage,
  FlashSaleItem,
  HomeResponse,
  MenuItem,
  OrderEasterEgg,
  OrderCreateRequest,
  OrderDeliveryAddressSnapshot,
  OrderQuote,
  PlaceSuggestion,
  PromotionCampaign,
  PromotionSnapshot,
  QuoteRequest,
  ShareCard,
  ShareCreateRequest,
  ShareLanding,
  ShareRewardConfig,
  ShareRewardResult,
  StorePromotion,
  StoreDetail,
  StoreSummary,
  UserProfile,
  VirtualOrder,
  WalletSummary,
  WalletTransaction,
  WechatMiniLoginRequest,
  WechatPhoneBindResult,
  WechatPhoneResult,
} from '@baichile/api-contract';
import type { DeliveryIncidentKey } from '@baichile/domain';
import {
  calculateLineCalories,
  calculateLineTotal,
  calculateOrderTotal,
  findDeliveryIncident,
  getDeliveryIncidentPhase,
  MAX_ORDER_QUANTITY,
  MIN_ORDER_QUANTITY,
  selectDeliveryIncident,
  validateSelections,
} from '@baichile/domain';
import type { DeliveryStatus, GeoPoint, VirtualRoute } from '@baichile/map-core';
import { resolveCatalogImageUrl } from './catalog-images';
import { buildStoreSearchText, normalizeCatalogSearchText } from './catalog-search';
import { collections } from './collections';
import { GameplayService, PromotionService } from './commerce';
import type { CollectionStore, Database, ListOptions } from './database';
import { badRequest, conflict, isCloudApiError, notFound, serviceUnavailable, unauthorized } from './errors';
import type {
  AccountDoc,
  AddressDoc,
  AnalyticsEventDoc,
  CategoryDoc,
  CheckoutSessionDoc,
  GameplayConfigDoc,
  MenuItemDoc,
  PromotionCampaignDoc,
  ShareRewardDailyDoc,
  ShareConfigDoc,
  ShareInviteDoc,
  StoreDoc,
  StoreSubCategoryDoc,
  VirtualOrderDoc,
  VisitorSessionDoc,
  WalletTransactionDoc,
} from './models';
import { buildSharePath, chooseShareTitle, DEFAULT_SHARE_REWARD_CONFIG, parseShareRewardConfig, sharePagePath } from './share-domain';
import { classifyPersona, selectMilestone, selectOrderEasterEgg } from './share-insights';
import { createShareMiniProgramCode, removeCloudFiles, resolveCloudFileUrls, uploadValidatedAvatar } from './storage';
import { sanitizeForAuditLog } from './redaction';
import { shanghaiBusinessDate } from './business-time';
import {
  sanitizeShareInviteCopy,
  sanitizeWalletTransactionCopy,
} from './product-copy';

const INITIAL_GRANT_CENTS = 300_000;
const DAILY_CHECKIN_CENTS = 50_000;
const BENEFIT_TEXT = '好友第一次来围观，双方各领虚拟饭钱——不能提现，但真能在这里花。';
const CLOUDBASE_PAGE_SIZE = 100;
const ORDER_STEP_TIMES = [0, 2_000, 5_000, 9_000, 14_000, 18_000] as const;
const DELIVERY_START_MS = ORDER_STEP_TIMES.at(-1)!;
const MIN_DELIVERY_DURATION_MS = 45_000;
const MAX_DELIVERY_DURATION_MS = 90_000;
const PAYMENT_METHOD: VirtualOrder['paymentMethod'] = 'virtual_balance';
const DEFAULT_PHONE_AVATAR = '/static/tabbar/profile.svg';
const VIRTUAL_FUNDS_NOTICE = '虚拟余额仅限本产品内使用，不可充值、提现或兑换真实货币。';
const GUEST_ACCESS_TOKEN_MS = 24 * 60 * 60 * 1000;
const GUEST_REFRESH_TOKEN_MS = 30 * 24 * 60 * 60 * 1000;

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
  return validateAddressText(input);
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
  readonly gameplay: GameplayService;
  readonly promotions: PromotionService;

  constructor(readonly db: Database) {
    this.auth = new AuthService(db, this);
    this.catalog = new CatalogService(db);
    this.addresses = new AddressService(db);
    this.wallet = new WalletService(db);
    this.gameplay = new GameplayService(db);
    this.promotions = new PromotionService(db);
    this.orders = new OrderService(db, this.catalog, this.wallet, this.promotions, this.gameplay);
    this.shares = new ShareService(db, this.wallet);
    this.analytics = new AnalyticsService(db, this.auth);
    this.map = new MapService();
  }
}

export class AuthService {
  private wechatAccessToken = '';
  private wechatAccessTokenExpiresAt = 0;

  constructor(private readonly db: Database, private readonly services: BaichileCloudServices) {}

  private bearerToken(authorization?: string): string {
    return (authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? authorization ?? '').trim();
  }

  async resolvePersistedIdentity(
    authorization?: string,
    openId?: string,
    webUid?: string,
  ): Promise<{ visitorId?: string; accountId?: string }> {
    const token = this.bearerToken(authorization);
    const guestSession = token ? await this.findGuestSessionByAccessToken(token) : null;
    const validGuestSession = guestSession
      && !guestSession.revokedAt
      && (!guestSession.expiresAt || Date.parse(guestSession.expiresAt) > Date.now())
      && guestSession.accessTokenHash === sha256(token)
      ? guestSession
      : null;
    let openIdAccount: AccountDoc | null = null;
    if (openId) {
      const digest = sha256(openId);
      openIdAccount = await this.db.collection<AccountDoc>(collections.accounts).findOne({ wechatOpenIdHash: digest });
      if (openIdAccount && openIdAccount.status !== 'active') {
        unauthorized(
          openIdAccount.status === 'deleted' ? '账号已注销' : '账号已被禁用',
          openIdAccount.status === 'deleted' ? 'ACCOUNT_DELETED' : 'ACCOUNT_DISABLED',
        );
      }
    }
    let webAccount: AccountDoc | null = null;
    if (webUid) {
      webAccount = await this.db.collection<AccountDoc>(collections.accounts)
        .findOne({ webAuthUidHash: sha256(webUid) });
      if (webAccount && webAccount.status !== 'active') {
        unauthorized(
          webAccount.status === 'deleted' ? '账号已注销' : '账号已被禁用',
          webAccount.status === 'deleted' ? 'ACCOUNT_DELETED' : 'ACCOUNT_DISABLED',
        );
      }
    }
    if (validGuestSession) return { visitorId: validGuestSession.visitorId };
    if (openIdAccount) return { accountId: openIdAccount.id };
    if (webAccount) return { accountId: webAccount.id };
    return {};
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
      webAuthUidHash: null,
      phoneHash: null,
      phoneNumber: null,
      mergedIntoAccountId: null,
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
    const session = this.newGuestSession();
    await this.db.collection<VisitorSessionDoc>(collections.visitorSessions).insert({
      _id: guestSessionId(session.accessToken),
      id: guestSessionId(session.accessToken),
      visitorId: session.visitorId,
      accountId: null,
      accessTokenHash: sha256(session.accessToken),
      refreshTokenHash: sha256(session.refreshToken),
      expiresAt: session.expiresAt,
      refreshExpiresAt: session.refreshExpiresAt,
      revokedAt: null,
      rotatedFromId: null,
      createdAt: this.db.now().toISOString(),
      updatedAt: this.db.now().toISOString(),
    });
    return session;
  }

  async rotateGuest(refreshToken: string, authorization?: string) {
    const raw = refreshToken.trim();
    const sessions = this.db.collection<VisitorSessionDoc>(collections.visitorSessions);
    const current = raw
      ? await sessions.findOne({ refreshTokenHash: sha256(raw) })
      : await this.findGuestSessionByAccessToken(this.bearerToken(authorization));
    const refreshExpired = raw && (!current?.refreshExpiresAt
      || Date.parse(current.refreshExpiresAt) <= Date.now());
    if (!current || current.revokedAt || refreshExpired) {
      unauthorized('游客刷新凭证已失效', 'INVALID_REFRESH_TOKEN');
    }
    const next = this.newGuestSession(current.visitorId);
    await this.db.transaction(async (tx) => {
      const txSessions = tx.collection<VisitorSessionDoc>(collections.visitorSessions);
      const latest = await txSessions.get(current.id);
      if (!latest || latest.revokedAt) unauthorized('游客刷新凭证已失效', 'INVALID_REFRESH_TOKEN');
      // visitorId has an existing unique index, so rotation replaces the old
      // token document atomically. Absence of the old hash revokes it.
      await txSessions.remove(current.id);
      await txSessions.insert({
        _id: guestSessionId(next.accessToken),
        id: guestSessionId(next.accessToken),
        visitorId: next.visitorId,
        accountId: current.accountId ?? null,
        accessTokenHash: sha256(next.accessToken),
        refreshTokenHash: sha256(next.refreshToken),
        expiresAt: next.expiresAt,
        refreshExpiresAt: next.refreshExpiresAt,
        revokedAt: null,
        rotatedFromId: current.id,
        createdAt: current.createdAt,
        updatedAt: tx.now().toISOString(),
      });
    });
    return next;
  }

  private async findGuestSessionByAccessToken(token: string): Promise<VisitorSessionDoc | null> {
    if (!token) return null;
    const sessions = this.db.collection<VisitorSessionDoc>(collections.visitorSessions);
    return sessions.get(guestSessionId(token));
  }

  async deleteAccount(accountId: string, confirmation: unknown): Promise<{ deleted: true }> {
    if (confirmation !== 'DELETE') badRequest('请输入 DELETE 确认注销', 'DELETE_CONFIRMATION_REQUIRED');
    let avatarFileId: string | null = null;
    await this.db.transaction(async (tx) => {
      const accounts = tx.collection<AccountDoc>(collections.accounts);
      const account = await accounts.get(accountId);
      if (!account || account.status === 'deleted') unauthorized('账号已注销', 'ACCOUNT_DELETED');
      avatarFileId = account.avatarUrl ?? null;
      const now = tx.now().toISOString();
      await accounts.update(accountId, {
        wechatOpenIdHash: null,
        webAuthUidHash: null,
        phoneHash: null,
        phoneNumber: null,
        mergedIntoAccountId: null,
        nickname: '已注销用户',
        avatarUrl: null,
        status: 'deleted',
        deletedAt: now,
        updatedAt: now,
      });
      const addresses = tx.collection<AddressDoc>(collections.addresses);
      for (const row of await listAll(addresses, { where: { accountId } })) {
        await addresses.remove(row.id);
      }
      const sessions = tx.collection<VisitorSessionDoc>(collections.visitorSessions);
      for (const row of await listAll(sessions, { where: { accountId } })) {
        await sessions.remove(row.id);
      }
      const checkouts = tx.collection<CheckoutSessionDoc>(collections.checkoutSessions);
      for (const row of await listAll(checkouts, {
        where: {
          $or: [
            { accountId },
            { subjectKey: `account:${accountId}` },
          ],
        },
      })) {
        await checkouts.remove(row.id);
      }
      const orders = tx.collection<VirtualOrderDoc>(collections.virtualOrders);
      for (const row of await listAll(orders, { where: { accountId } })) {
        await orders.update(row.id, {
          deliveryAddress: anonymizedDeliveryAddress(row.deliveryAddress),
          destinationId: 'deleted-account-destination',
          route: anonymizedVirtualRoute(),
          updatedAt: now,
        });
      }
      const shares = tx.collection<ShareInviteDoc>(collections.shareInvites);
      for (const row of await listAll(shares, { where: { inviterAccountId: accountId } })) {
        if (!row.snapshot.identity) continue;
        await shares.update(row.token, {
          snapshot: {
            ...row.snapshot,
            identity: {
              nickname: '已注销用户',
              avatarUrl: '',
            },
          },
        });
      }
    });
    await removeCloudFiles([avatarFileId]);
    return { deleted: true };
  }

  private newGuestSession(visitorId = `visitor_${randomUUID()}`) {
    const now = this.db.now().getTime();
    return {
      visitorId,
      accessToken: `guest.${randomUUID()}`,
      refreshToken: `refresh.${randomUUID()}`,
      expiresAt: new Date(now + GUEST_ACCESS_TOKEN_MS).toISOString(),
      refreshExpiresAt: new Date(now + GUEST_REFRESH_TOKEN_MS).toISOString(),
    };
  }

  async loginWechatMini(input: WechatMiniLoginRequest, openId?: string): Promise<AccountSession> {
    const profile = validateProfile(input.profile, input.code);
    const appId = process.env.WECHAT_MINI_APP_ID;
    const appSecret = process.env.WECHAT_MINI_APP_SECRET;
    const resolvedOpenId = openId || await this.resolveWechatOpenId(input.code, appId, appSecret);
    const digest = sha256(resolvedOpenId);
    const accounts = this.db.collection<AccountDoc>(collections.accounts);
    const existing = await accounts.findOne({ wechatOpenIdHash: digest });
    if (existing && existing.status !== 'active') unauthorized(
      existing.status === 'deleted' ? '账号已注销' : '账号已被禁用',
      existing.status === 'deleted' ? 'ACCOUNT_DELETED' : 'ACCOUNT_DISABLED',
    );
    const baseAccountId = `account_${digest.slice(0, 24)}`;
    const baseAccount = existing ? null : await accounts.get(baseAccountId);
    const accountId = existing?.id ?? (
      baseAccount?.status === 'deleted'
        ? `${baseAccountId}_${sha256(randomUUID()).slice(0, 8)}`
        : baseAccountId
    );
    await this.db.transaction(async (tx) => {
      const now = tx.now().toISOString();
      const txAccounts = tx.collection<AccountDoc>(collections.accounts);
      const current = await txAccounts.get(accountId);
      if (current) {
        await txAccounts.update(accountId, {
          wechatOpenIdHash: digest,
          nickname: profile.nickname,
          avatarUrl: profile.avatarUrl,
          updatedAt: now,
        });
      } else {
        await txAccounts.insert({
          _id: accountId,
          id: accountId,
          wechatOpenIdHash: digest,
          webAuthUidHash: null,
          phoneHash: null,
          phoneNumber: null,
          mergedIntoAccountId: null,
          nickname: profile.nickname,
          avatarUrl: profile.avatarUrl,
          balanceCents: 0,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
      }
      if (input.visitorId) await this.linkVisitorToAccount(input.visitorId, accountId, tx);
      await this.services.wallet.initializeAccount(accountId, tx);
    });
    if (!existing) await this.services.shares.completeReferral(accountId, input.referralToken);
    return { accountId, accessToken: '', provider: 'wechat', profile };
  }

  async loginWebPhone(webUid: string, verifiedPhone?: string): Promise<AccountSession> {
    const uid = webUid.trim();
    if (!uid) unauthorized('未检测到可信的 Web 登录身份', 'WEB_PHONE_UNVERIFIED');
    const accounts = this.db.collection<AccountDoc>(collections.accounts);
    const webAuthUidHash = sha256(uid);
    const byUid = await accounts.findOne({ webAuthUidHash });
    const phoneNumber = verifiedPhone
      ? normalizeChinaPhone(verifiedPhone)
      : byUid?.phoneNumber
        ? normalizeChinaPhone(byUid.phoneNumber)
        : unauthorized('手机号登录态未通过 CloudBase 验证', 'WEB_PHONE_UNVERIFIED');
    const phoneHash = sha256(`+86${phoneNumber}`);
    const byPhone = await accounts.findOne({ phoneHash });
    if (byUid && byPhone && byUid.id !== byPhone.id) {
      conflict('手机号身份存在冲突，请稍后重试', 'PHONE_IDENTITY_CONFLICT');
    }
    let account = byUid ?? byPhone;
    if (account?.status === 'disabled' && account.mergedIntoAccountId) {
      account = await accounts.get(account.mergedIntoAccountId);
    }
    if (account && account.status !== 'active') unauthorized(
      account.status === 'deleted' ? '账号已注销' : '账号已被禁用',
      account.status === 'deleted' ? 'ACCOUNT_DELETED' : 'ACCOUNT_DISABLED',
    );

    const baseAccountId = `account_phone_${phoneHash.slice(0, 24)}`;
    const baseAccount = account ? null : await accounts.get(baseAccountId);
    const accountId = account?.id ?? (
      baseAccount?.status === 'deleted'
        ? `${baseAccountId}_${sha256(randomUUID()).slice(0, 8)}`
        : baseAccountId
    );
    await this.db.transaction(async (tx) => {
      const txAccounts = tx.collection<AccountDoc>(collections.accounts);
      const now = tx.now().toISOString();
      const current = await txAccounts.get(accountId);
      if (current) {
        if (current.phoneHash && current.phoneHash !== phoneHash) {
          conflict('该 Web 身份已绑定其他手机号', 'PHONE_IDENTITY_CONFLICT');
        }
        await txAccounts.update(accountId, {
          webAuthUidHash,
          phoneHash,
          phoneNumber,
          nickname: current.wechatOpenIdHash ? current.nickname : phoneNumber,
          avatarUrl: current.wechatOpenIdHash ? current.avatarUrl : null,
          mergedIntoAccountId: null,
          updatedAt: now,
        });
      } else {
        await txAccounts.insert({
          _id: accountId,
          id: accountId,
          wechatOpenIdHash: null,
          webAuthUidHash,
          phoneHash,
          phoneNumber,
          mergedIntoAccountId: null,
          nickname: phoneNumber,
          avatarUrl: null,
          balanceCents: 0,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
      }
      await this.services.wallet.initializeAccount(accountId, tx);
    });
    return {
      accountId,
      accessToken: '',
      provider: 'phone',
      profile: { nickname: phoneNumber, avatarUrl: DEFAULT_PHONE_AVATAR },
    };
  }

  async bindWechatPhone(openId: string, code: string): Promise<WechatPhoneBindResult> {
    const openIdHash = sha256(openId);
    const phone = await this.getWechatPhoneNumber(code);
    const phoneNumber = normalizeChinaPhone(phone.phoneNumber || phone.purePhoneNumber);
    const phoneHash = sha256(`+86${phoneNumber}`);
    const accounts = this.db.collection<AccountDoc>(collections.accounts);
    const wechatAccount = await accounts.findOne({ wechatOpenIdHash: openIdHash });
    if (!wechatAccount) unauthorized('请先完成微信登录', 'WECHAT_ACCOUNT_REQUIRED');
    if (wechatAccount.status === 'disabled') unauthorized('账号已被禁用', 'ACCOUNT_DISABLED');
    if (wechatAccount.phoneHash && wechatAccount.phoneHash !== phoneHash) {
      conflict('当前微信账号已绑定其他手机号', 'PHONE_ALREADY_BOUND');
    }
    const phoneAccount = await accounts.findOne({ phoneHash });
    if (phoneAccount?.wechatOpenIdHash && phoneAccount.wechatOpenIdHash !== openIdHash) {
      conflict('该手机号已绑定其他微信账号', 'PHONE_ALREADY_BOUND');
    }

    const emptySummary = emptyAccountMergeSummary();
    const result = await this.db.transaction(async (tx) => {
      const target = await tx.collection<AccountDoc>(collections.accounts).get(wechatAccount.id);
      if (!target) notFound('微信账号不存在', 'ACCOUNT_NOT_FOUND');
      const source = phoneAccount && phoneAccount.id !== target.id
        ? await tx.collection<AccountDoc>(collections.accounts).get(phoneAccount.id)
        : null;
      if (source?.wechatOpenIdHash && source.wechatOpenIdHash !== openIdHash) {
        conflict('该手机号已绑定其他微信账号', 'PHONE_ALREADY_BOUND');
      }
      if (source?.webAuthUidHash && target.webAuthUidHash && source.webAuthUidHash !== target.webAuthUidHash) {
        conflict('当前微信账号已关联其他 Web 身份', 'PHONE_IDENTITY_CONFLICT');
      }
      const migrated = source
        ? await this.mergeAccountInto(tx, source, target)
        : emptySummary;
      const latestTarget = await tx.collection<AccountDoc>(collections.accounts).get(target.id);
      if (!latestTarget) notFound('微信账号不存在', 'ACCOUNT_NOT_FOUND');
      await tx.collection<AccountDoc>(collections.accounts).update(target.id, {
        phoneHash,
        phoneNumber,
        webAuthUidHash: source?.webAuthUidHash ?? latestTarget.webAuthUidHash ?? null,
        mergedIntoAccountId: null,
        updatedAt: tx.now().toISOString(),
      });
      return { migrated, merged: Boolean(source) };
    });

    const updated = await accounts.get(wechatAccount.id);
    if (!updated) notFound('微信账号不存在', 'ACCOUNT_NOT_FOUND');
    return {
      session: {
        accountId: updated.id,
        accessToken: '',
        provider: 'wechat',
        profile: {
          nickname: updated.nickname || '微信用户',
          avatarUrl: updated.avatarUrl || DEFAULT_PHONE_AVATAR,
        },
      },
      phoneNumber,
      merged: result.merged,
      migrated: result.migrated,
    };
  }

  async getWechatPhoneNumber(code: string): Promise<WechatPhoneResult> {
    if (!code?.trim()) badRequest('手机号授权凭证不能为空');
    const accessToken = await this.getWechatAccessToken();
    const response = await fetchWithTimeout(
      `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      },
      { label: '微信手机号服务', timeoutMs: 4_000 },
    );
    const body = await response.json() as { errcode?: number; phone_info?: WechatPhoneResult };
    if (!response.ok || body.errcode || !body.phone_info?.phoneNumber) {
      badRequest('微信手机号授权已失效，请重试');
    }
    return body.phone_info;
  }

  async uploadAvatar(openId: string, contentBase64: string): Promise<{ fileID: string }> {
    const digest = sha256(openId);
    const account = await this.db.collection<AccountDoc>(collections.accounts).findOne({ wechatOpenIdHash: digest });
    const fileID = await uploadValidatedAvatar(openId, contentBase64);
    if (account?.avatarUrl && account.avatarUrl !== fileID) await removeCloudFiles([account.avatarUrl]);
    return { fileID };
  }

  async linkVisitorToAccount(visitorId: string, accountId: string, db = this.db): Promise<void> {
    const sessions = db.collection<VisitorSessionDoc>(collections.visitorSessions);
    const existing = await sessions.findOne({ visitorId });
    if (existing) {
      const now = db.now().toISOString();
      await sessions.update(existing.id, { accountId, revokedAt: now, updatedAt: now });
    }
  }

  private async mergeAccountInto(
    db: Database,
    source: AccountDoc,
    target: AccountDoc,
  ): Promise<AccountMergeSummary> {
    if (source.id === target.id || source.mergedIntoAccountId === target.id) return emptyAccountMergeSummary();
    const migrated = emptyAccountMergeSummary();
    const now = db.now().toISOString();

    const visitorSessions = db.collection<VisitorSessionDoc>(collections.visitorSessions);
    const sourceVisitors = await listAll(visitorSessions, { where: { accountId: source.id } });
    for (const row of sourceVisitors) {
      await visitorSessions.update(row.id, { accountId: target.id });
    }
    migrated.visitorSessions = sourceVisitors.length;

    const orders = db.collection<VirtualOrderDoc>(collections.virtualOrders);
    const sourceOrders = await listAll(orders, { where: { accountId: source.id } });
    for (const row of sourceOrders) {
      await orders.update(row.id, { accountId: target.id, updatedAt: now });
    }
    migrated.orders = sourceOrders.length;

    migrated.addresses = await mergeAccountAddresses(db, source.id, target.id);

    const walletTransactions = db.collection<WalletTransactionDoc>(collections.walletTransactions);
    const [targetTransactions, sourceTransactions] = await Promise.all([
      listAll(walletTransactions, { where: { accountId: target.id } }),
      listAll(walletTransactions, { where: { accountId: source.id } }),
    ]);
    for (const row of sourceTransactions) {
      await walletTransactions.update(row.id, { accountId: target.id });
    }
    const allTransactions = [...targetTransactions, ...sourceTransactions]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    const mergedBalanceCents = target.balanceCents + source.balanceCents;
    let runningBalance = mergedBalanceCents - allTransactions.reduce((sum, row) => sum + row.amountCents, 0);
    for (const row of allTransactions) {
      runningBalance += row.amountCents;
      await walletTransactions.update(row.id, { balanceAfterCents: runningBalance });
    }
    migrated.walletTransactions = sourceTransactions.length;

    const shareInvites = db.collection<ShareInviteDoc>(collections.shareInvites);
    const startedShares = await listAll(shareInvites, { where: { inviterAccountId: source.id } });
    for (const row of startedShares) {
      await shareInvites.update(row.token, { inviterAccountId: target.id });
    }
    const sourceInvitee = await shareInvites.findOne({ inviteeAccountId: source.id });
    if (sourceInvitee) {
      const targetInvitee = await shareInvites.findOne({ inviteeAccountId: target.id });
      await shareInvites.update(sourceInvitee.token, {
        inviteeAccountId: targetInvitee ? null : target.id,
      });
    }
    migrated.shareInvites = startedShares.length + (sourceInvitee ? 1 : 0);

    const analytics = db.collection<AnalyticsEventDoc>(collections.analyticsEvents);
    const sourceEvents = await listAll(analytics, { where: { accountId: source.id } });
    for (const row of sourceEvents) {
      await analytics.update(row.id, { accountId: target.id });
    }
    migrated.analyticsEvents = sourceEvents.length;

    const accounts = db.collection<AccountDoc>(collections.accounts);
    await accounts.update(source.id, {
      webAuthUidHash: null,
      phoneHash: null,
      phoneNumber: null,
      balanceCents: 0,
      status: 'disabled',
      mergedIntoAccountId: target.id,
      updatedAt: now,
    });
    await accounts.update(target.id, {
      webAuthUidHash: target.webAuthUidHash ?? source.webAuthUidHash ?? null,
      phoneHash: target.phoneHash ?? source.phoneHash ?? null,
      phoneNumber: target.phoneNumber ?? source.phoneNumber ?? null,
      balanceCents: mergedBalanceCents,
      mergedIntoAccountId: null,
      updatedAt: now,
    });
    return migrated;
  }

  private async resolveWechatOpenId(code: string, appId?: string, appSecret?: string): Promise<string> {
    if (!appId || !appSecret) {
      if (process.env.NODE_ENV === 'production') badRequest('微信登录配置缺失', 'WECHAT_CONFIG_MISSING');
      return `dev_${code}_${randomUUID()}`;
    }
    const query = new URLSearchParams({ appid: appId, secret: appSecret, js_code: code, grant_type: 'authorization_code' });
    const response = await fetchWithTimeout(
      `https://api.weixin.qq.com/sns/jscode2session?${query}`,
      {},
      { label: '微信登录服务', timeoutMs: 4_000, retries: 1 },
    );
    const session = await response.json() as { openid?: string; errcode?: number };
    if (!response.ok || !session.openid || session.errcode) badRequest('微信登录凭证无效');
    return session.openid;
  }

  private async getWechatAccessToken(): Promise<string> {
    if (this.wechatAccessToken && Date.now() < this.wechatAccessTokenExpiresAt) return this.wechatAccessToken;
    const appId = process.env.WECHAT_MINI_APP_ID;
    const appSecret = process.env.WECHAT_MINI_APP_SECRET;
    if (!appId || !appSecret) badRequest('微信手机号能力配置缺失', 'WECHAT_CONFIG_MISSING');
    const response = await fetchWithTimeout(
      'https://api.weixin.qq.com/cgi-bin/stable_token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'client_credential', appid: appId, secret: appSecret, force_refresh: false }),
      },
      { label: '微信令牌服务', timeoutMs: 4_000, retries: 1 },
    );
    const body = await response.json() as { access_token?: string; expires_in?: number; errcode?: number };
    if (!response.ok || body.errcode || !body.access_token) badRequest('微信手机号服务暂不可用', 'WECHAT_PHONE_UNAVAILABLE');
    this.wechatAccessToken = body.access_token;
    this.wechatAccessTokenExpiresAt = Date.now() + Math.max(60, (body.expires_in ?? 7200) - 300) * 1000;
    return this.wechatAccessToken;
  }
}

export class CatalogService {
  private homeCache?: { expiresAt: number; value: HomeResponse };
  private homeRequest?: Promise<HomeResponse>;

  constructor(private readonly db: Database) {}

  async home(): Promise<HomeResponse> {
    if (this.homeCache && this.homeCache.expiresAt > Date.now()) return this.homeCache.value;
    if (this.homeRequest) return this.homeRequest;
    this.homeRequest = this.loadHome();
    try {
      const value = await this.homeRequest;
      this.homeCache = { value, expiresAt: Date.now() + 30_000 };
      return value;
    } finally {
      this.homeRequest = undefined;
    }
  }

  async categories(): Promise<HomeResponse['categories']> {
    const rows = await listAll(this.db.collection<CategoryDoc>(collections.categories), {
      orderBy: [['sortOrder', 'asc']],
    });
    return rows.map(({ id, name, icon }) => ({ id, name, icon }));
  }

  private async loadHome(): Promise<HomeResponse> {
    const now = this.db.now().toISOString();
    const [categories, storeRows, publishedPromotions] = await Promise.all([
      listAll(this.db.collection<CategoryDoc>(collections.categories), { orderBy: [['sortOrder', 'asc']] }),
      listAll(this.db.collection<StoreDoc>(collections.stores), {
        where: { status: 'active' },
        orderBy: [['sortOrder', 'asc']],
      }),
      this.db.collection<PromotionCampaignDoc>(collections.promotionCampaigns).list({
        where: { lifecycleStatus: 'published' },
        orderBy: [['startsAt', 'asc']],
      }),
    ]);
    const flashPromotions = publishedPromotions
      .filter((promotion) => (
        promotion.type === 'item_flash'
        && promotion.startsAt <= now
        && promotion.endsAt > now
        && promotion.menuItemId
        && promotion.flashPriceCents !== undefined
      ));
    const activeStoreIds = new Set(storeRows.map((store) => store.id));
    const storePromotions: StorePromotion[] = publishedPromotions
      .filter((promotion) => (
        promotion.type === 'store_threshold'
        && promotion.startsAt <= now
        && promotion.endsAt > now
        && activeStoreIds.has(promotion.storeId)
        && promotion.tiers?.length
      ))
      .map((promotion) => ({
        promotionId: promotion.id,
        storeId: promotion.storeId,
        name: promotion.name,
        tiers: promotion.tiers!,
        startsAt: promotion.startsAt,
        endsAt: promotion.endsAt,
      }));
    const menuItems = (await Promise.all(flashPromotions.map((promotion) => (
      this.db.collection<MenuItemDoc>(collections.menuItems).get(promotion.menuItemId!)
    )))).filter((item): item is MenuItemDoc => Boolean(item?.status === 'active'));
    const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));
    const imageUrls = await resolveCloudFileUrls([
      ...storeRows.map((row) => row.coverUrl),
      ...menuItems.map((item) => item.imageUrl),
    ]);
    const stores = storeRows.map((row) => toStoreSummary(row, imageUrls));
    const storesById = new Map(storeRows.map((store) => [store.id, store]));
    const flashSaleItems: FlashSaleItem[] = flashPromotions
      .filter((promotion) => {
        const item = promotion.menuItemId ? menuItemsById.get(promotion.menuItemId) : undefined;
        return Boolean(item && storesById.has(item.storeId));
      })
      .slice(0, 3)
      .map((promotion) => {
        const item = menuItemsById.get(promotion.menuItemId!)!;
        const store = storesById.get(item.storeId)!;
        return {
          promotionId: promotion.id,
          menuItemId: item.id,
          storeId: item.storeId,
          subCategoryId: item.subCategoryId ?? undefined,
          storeName: store.name,
          name: item.name,
          imageUrl: resolveImageUrl(item.imageUrl, imageUrls),
          originalPriceCents: item.basePriceCents,
          flashPriceCents: promotion.flashPriceCents!,
          startsAt: promotion.startsAt,
          endsAt: promotion.endsAt,
        };
      });
    return {
      categories: categories.map(({ id, name, icon }) => ({ id, name, icon })),
      featured: stores.slice(0, 3),
      flashSaleItems,
      storePromotions,
      stores,
      nextCursor: null,
    };
  }

  async list(categoryId?: string, query?: string): Promise<StoreSummary[]> {
    const storeRows = await listAll(this.db.collection<StoreDoc>(collections.stores), {
      where: { ...(categoryId ? { categoryId } : {}), status: 'active' },
      orderBy: [['sortOrder', 'asc']],
    });
    const imageUrls = await resolveCloudFileUrls(storeRows.map((row) => row.coverUrl));
    const normalized = normalizeCatalogSearchText(query ?? '');
    if (!normalized) return storeRows.map((row) => toStoreSummary(row, imageUrls));

    let searchableRows = storeRows;
    if (storeRows.some((row) => typeof row.searchText !== 'string')) {
      const menuItems = await listAll(this.db.collection<MenuItemDoc>(collections.menuItems), {
        where: { status: 'active' },
      });
      const itemsByStore = new Map<string, MenuItemDoc[]>();
      for (const item of menuItems) {
        const rows = itemsByStore.get(item.storeId) ?? [];
        rows.push(item);
        itemsByStore.set(item.storeId, rows);
      }
      searchableRows = storeRows.map((row) => ({
        ...row,
        searchText: row.searchText ?? buildStoreSearchText(row, itemsByStore.get(row.id) ?? []),
      }));
    }
    return searchableRows
      .filter((row) => row.searchText?.includes(normalized))
      .map((row) => toStoreSummary(row, imageUrls));
  }

  async find(storeId: string): Promise<StoreDetail> {
    const store = await this.db.collection<StoreDoc>(collections.stores).get(storeId);
    if (!store || store.status !== 'active') notFound('店铺不存在', 'STORE_NOT_FOUND');
    const [detail, activePromotions] = await Promise.all([
      this.assemble([store]).then((rows) => rows[0]),
      new PromotionService(this.db).activeForStore(storeId),
    ]);
    const menuById = new Map(detail.menu.map((item) => [item.id, item]));
    const flashSaleItems: FlashSaleItem[] = activePromotions
      .filter((promotion) => (
        promotion.type === 'item_flash'
        && promotion.menuItemId
        && promotion.flashPriceCents !== undefined
        && menuById.has(promotion.menuItemId)
      ))
      .map((promotion) => {
        const item = menuById.get(promotion.menuItemId!)!;
        return {
          promotionId: promotion.id,
          menuItemId: item.id,
          storeId,
          subCategoryId: item.subCategoryId,
          storeName: store.name,
          name: item.name,
          imageUrl: item.imageUrl,
          originalPriceCents: item.basePriceCents,
          flashPriceCents: promotion.flashPriceCents!,
          startsAt: promotion.startsAt,
          endsAt: promotion.endsAt,
        };
      });
    const storePromotions: StorePromotion[] = activePromotions
      .filter((promotion) => promotion.type === 'store_threshold' && promotion.tiers?.length)
      .map((promotion) => ({
        promotionId: promotion.id,
        storeId,
        name: promotion.name,
        tiers: promotion.tiers!,
        startsAt: promotion.startsAt,
        endsAt: promotion.endsAt,
      }));
    return { ...detail, flashSaleItems, storePromotions };
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
      const amountCents = grants.length ? 0 : INITIAL_GRANT_CENTS;
      if (!amountCents) return;
      const balanceCents = account.balanceCents + amountCents;
      await accounts.update(accountId, { balanceCents, updatedAt: tx.now().toISOString() });
      await txs.insert(walletTx(tx, accountId, 'initial_grant', amountCents, balanceCents, '新用户赠送'));
    });
  }

  async summary(accountId: string): Promise<WalletSummary> {
    await this.initializeAccount(accountId);
    const account = await this.db.collection<AccountDoc>(collections.accounts).get(accountId);
    if (!account) notFound('用户不存在', 'ACCOUNT_NOT_FOUND');
    return {
      balanceCents: account.balanceCents,
      checkedInToday: await this.hasCheckedIn(accountId),
      notice: VIRTUAL_FUNDS_NOTICE,
    };
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
      const transactionId = `daily_checkin_${accountId}_${businessDate}`;
      if (await txs.get(transactionId) || await txs.findOne({ accountId, type: 'daily_checkin', businessDate })) {
        conflict('今日已签到', 'ALREADY_CHECKED_IN');
      }
      const accounts = tx.collection<AccountDoc>(collections.accounts);
      const account = await accounts.get(accountId);
      if (!account) notFound('用户不存在', 'ACCOUNT_NOT_FOUND');
      const balanceCents = account.balanceCents + DAILY_CHECKIN_CENTS;
      await accounts.update(accountId, { balanceCents, updatedAt: tx.now().toISOString() });
      await txs.insert(walletTx(tx, accountId, 'daily_checkin', DAILY_CHECKIN_CENTS, balanceCents, '每日签到', {
        _id: transactionId,
        id: transactionId,
        businessDate,
      }));
      return { balanceCents, checkedInToday: true, notice: VIRTUAL_FUNDS_NOTICE };
    });
  }

  async credit(
    accountId: string,
    amountCents: number,
    type: WalletTransactionDoc['type'],
    description: string,
    db = this.db,
    transactionExtras: Partial<WalletTransactionDoc> = {},
  ): Promise<WalletSummary> {
    return db.transaction(async (tx) => {
      const accounts = tx.collection<AccountDoc>(collections.accounts);
      const account = await accounts.get(accountId);
      if (!account) notFound('用户不存在', 'ACCOUNT_NOT_FOUND');
      const balanceCents = account.balanceCents + amountCents;
      if (balanceCents < 0) conflict('余额不足', 'INSUFFICIENT_BALANCE');
      await accounts.update(accountId, { balanceCents, updatedAt: tx.now().toISOString() });
      await tx.collection<WalletTransactionDoc>(collections.walletTransactions)
        .insert(walletTx(tx, accountId, type, amountCents, balanceCents, description, transactionExtras));
      return {
        balanceCents,
        checkedInToday: await this.hasCheckedIn(accountId, tx),
        notice: VIRTUAL_FUNDS_NOTICE,
      };
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
      .insert(walletTx(
        db,
        accountId,
        'order_payment',
        -amountCents,
        balanceCents,
        '订单扣款（虚拟余额）',
        { orderId },
      ));
  }

  async hasCheckedIn(accountId: string, db = this.db): Promise<boolean> {
    return Boolean(await db.collection<WalletTransactionDoc>(collections.walletTransactions)
      .findOne({ accountId, type: 'daily_checkin', businessDate: shanghaiBusinessDate() }));
  }
}

export class OrderService {
  constructor(
    private readonly db: Database,
    private readonly catalog: CatalogService,
    private readonly wallet: WalletService,
    private readonly promotions: PromotionService,
    private readonly gameplay: GameplayService,
  ) {}

  private async baseQuote(request: QuoteRequest): Promise<{ quote: OrderQuote; store: StoreDetail }> {
    if (!request.lines?.length) badRequest('购物车不能为空');
    if (request.lines.length > 50) badRequest('单个订单最多包含 50 项商品', 'ORDER_TOO_LARGE');
    if (request.lines.some((line) => (
      !Number.isInteger(line.quantity)
      || line.quantity < MIN_ORDER_QUANTITY
      || line.quantity > MAX_ORDER_QUANTITY
    ))) {
      badRequest(
        `单项商品数量必须在 ${MIN_ORDER_QUANTITY} 到 ${MAX_ORDER_QUANTITY} 之间`,
        'INVALID_QUANTITY',
      );
    }
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
    if (!Number.isSafeInteger(itemsTotalCents) || itemsTotalCents < 0 || itemsTotalCents > 10_000_000) {
      badRequest('订单金额超出允许范围', 'INVALID_ORDER_TOTAL');
    }
    return {
      store,
      quote: {
        storeId: store.id,
        lines,
        itemsTotalCents,
        deliveryFeeCents: store.deliveryFeeCents,
        packingFeeCents: store.packingFeeCents,
        totalCents: calculateOrderTotal(
          lines.map((line) => line.totalCents),
          store.deliveryFeeCents + store.packingFeeCents,
        ),
        itemsTotalCaloriesKcal,
      },
    };
  }

  async quote(request: QuoteRequest): Promise<OrderQuote> {
    const { quote, store } = await this.baseQuote(request);
    if (quote.itemsTotalCents < store.minimumOrderCents) {
      conflict(`未达到起送金额 ¥${(store.minimumOrderCents / 100).toFixed(2)}`, 'MINIMUM_ORDER_NOT_MET');
    }
    return quote;
  }

  async quoteCheckout(
    request: CheckoutQuoteRequest,
    identity: { visitorId?: string; accountId?: string },
  ): Promise<CheckoutQuote> {
    if (!identity.accountId && !identity.visitorId) unauthorized();
    if (!Array.isArray(request?.stores) || !request.stores.length || request.stores.length > 20) {
      badRequest('结算需包含 1 到 20 个商家', 'INVALID_CHECKOUT');
    }
    const storeIds = request.stores.map((store) => store?.storeId);
    if (storeIds.some((id) => typeof id !== 'string') || new Set(storeIds).size !== storeIds.length) {
      badRequest('同一结算中的商家不能重复', 'INVALID_CHECKOUT');
    }
    if (!request.virtualDestinationId?.trim()) badRequest('请选择配送地址', 'INVALID_CHECKOUT');
    normalizeDeliveryAddressSnapshot(request.deliveryAddressSnapshot);
    const subjectKey = identitySubject(identity);
    const sessions = this.db.collection<CheckoutSessionDoc>(collections.checkoutSessions);
    if (request.checkoutId) validateCheckoutIdentifier(request.checkoutId, 'checkoutId');
    const requestedSession = request.checkoutId ? await sessions.get(request.checkoutId) : null;
    if (request.checkoutId && (!requestedSession || requestedSession.subjectKey !== subjectKey)) {
      badRequest('结算会话不匹配', 'QUOTE_MISMATCH');
    }
    if (requestedSession && Date.parse(requestedSession.checkoutExpiresAt) <= this.db.now().getTime()) {
      conflict('结算已过期，请重新开始', 'CHECKOUT_EXPIRED');
    }

    const quotedAt = this.db.now();
    const quoteStores = await Promise.all(request.stores.map((store) => this.quoteStoreWithPromotions({
      storeId: store.storeId,
      lines: store.lines,
      virtualDestinationId: request.virtualDestinationId,
      virtualDestinationPoint: request.virtualDestinationPoint,
      deliveryAddressSnapshot: request.deliveryAddressSnapshot,
    }, quotedAt.toISOString())));
    let checkoutId = requestedSession?.id ?? `checkout_${randomUUID()}`;
    const quoteId = `quote_${randomUUID()}`;
    const expiresAt = new Date(quotedAt.getTime() + 5 * 60_000).toISOString();
    const checkoutExpiresAt = requestedSession?.checkoutExpiresAt
      ?? new Date(quotedAt.getTime() + 30 * 60_000).toISOString();
    const quote: CheckoutQuote = {
      checkoutId,
      quoteId,
      quotedAt: quotedAt.toISOString(),
      expiresAt,
      checkoutExpiresAt,
      stores: quoteStores,
      originalItemsTotalCents: quoteStores.reduce((sum, store) => sum + store.originalItemsTotalCents, 0),
      itemsTotalCents: quoteStores.reduce((sum, store) => sum + store.itemsTotalCents, 0),
      deliveryFeeCents: quoteStores.reduce((sum, store) => sum + store.deliveryFeeCents, 0),
      packingFeeCents: quoteStores.reduce((sum, store) => sum + store.packingFeeCents, 0),
      minimumOrderShortfallCents: quoteStores.reduce((sum, store) => sum + store.minimumOrderShortfallCents, 0),
      flashDiscountCents: quoteStores.reduce((sum, store) => sum + store.flashDiscountCents, 0),
      storeDiscountCents: quoteStores.reduce((sum, store) => sum + store.storeDiscountCents, 0),
      promotionDiscountCents: quoteStores.reduce((sum, store) => sum + store.promotionDiscountCents, 0),
      totalCents: quoteStores.reduce((sum, store) => sum + store.totalCents, 0),
    };
    await this.db.transaction(async (tx) => {
      const txSessions = tx.collection<CheckoutSessionDoc>(collections.checkoutSessions);
      if (requestedSession) {
        const current = await txSessions.get(requestedSession.id);
        if (!current || current.subjectKey !== subjectKey) {
          badRequest('结算会话不匹配', 'QUOTE_MISMATCH');
        }
        if (Date.parse(current.checkoutExpiresAt) <= tx.now().getTime()) {
          conflict('结算已过期，请重新开始', 'CHECKOUT_EXPIRED');
        }
        quote.checkoutId = current.id;
        quote.checkoutExpiresAt = current.checkoutExpiresAt;
        await txSessions.update(current.id, {
          quoteId,
          request,
          quote,
          quotedAt: quote.quotedAt,
          expiresAt,
          updatedAt: quote.quotedAt,
        });
        return;
      }
      const existingSubjectSession = await txSessions.findOne({ subjectKey });
      if (identity.visitorId && existingSubjectSession) {
        unauthorized('游客仅可创建一次结算，请登录后继续', 'LOGIN_REQUIRED');
      }
      const previousOrders = await tx.collection<VirtualOrderDoc>(collections.virtualOrders).count(
        identity.accountId ? { accountId: identity.accountId } : { visitorId: identity.visitorId },
      );
      const reservationId = `checkout_first_${sha256(subjectKey).slice(0, 40)}`;
      const reservation = await txSessions.get(reservationId);
      const firstCheckout = previousOrders === 0 && !existingSubjectSession && !reservation;
      checkoutId = firstCheckout || identity.visitorId ? reservationId : checkoutId;
      quote.checkoutId = checkoutId;
      await txSessions.insert({
        _id: checkoutId,
        id: checkoutId,
        quoteId,
        subjectKey,
        visitorId: identity.visitorId ?? null,
        accountId: identity.accountId ?? null,
        request,
        quote,
        quotedAt: quote.quotedAt,
        expiresAt,
        checkoutExpiresAt,
        firstCheckout,
        createdOrderIds: [],
        createdStoreIds: [],
        createdAt: quote.quotedAt,
        updatedAt: quote.quotedAt,
      });
    });
    return quote;
  }

  async create(
    request: OrderCreateRequest,
    subject: string | { visitorId?: string; accountId?: string },
  ): Promise<VirtualOrder> {
    const identity = typeof subject === 'string' ? { accountId: subject } : subject;
    if (!identity.accountId && !identity.visitorId) unauthorized();
    if (identity.accountId) await this.wallet.initializeAccount(identity.accountId);

    const metadata = [request.checkoutId, request.quoteId, request.idempotencyKey];
    const metadataCount = metadata.filter((value) => typeof value === 'string' && value.trim()).length;
    if (metadataCount > 0 && metadataCount < metadata.length) {
      badRequest('checkoutId、quoteId 与 idempotencyKey 必须同时提供', 'INVALID_CHECKOUT');
    }
    const legacyCreate = metadataCount === 0;
    const subjectKey = identitySubject(identity);
    let idempotencyKey = '';
    let id = '';
    let effectiveRequest: QuoteRequest = request;
    let quote: OrderQuote | CheckoutStoreQuote;
    let checkout: CheckoutSessionDoc | null = null;
    let firstCheckout = false;

    if (!legacyCreate) {
      validateCheckoutIdentifier(request.checkoutId!, 'checkoutId');
      validateCheckoutIdentifier(request.quoteId!, 'quoteId');
      validateIdempotencyKey(request.idempotencyKey!);
      idempotencyKey = request.idempotencyKey!;
      id = `order_${sha256(`${subjectKey}:${idempotencyKey}`).slice(0, 48)}`;
      const existing = await this.db.collection<VirtualOrderDoc>(collections.virtualOrders).get(id);
      if (existing) {
        assertOrderRetryMatches(existing, request, identity);
        return this.toOrder(existing);
      }
      checkout = await this.db.collection<CheckoutSessionDoc>(collections.checkoutSessions).get(request.checkoutId!);
      if (!checkout || checkout.quoteId !== request.quoteId || checkout.subjectKey !== subjectKey) {
        badRequest('结算报价不匹配', 'QUOTE_MISMATCH');
      }
      if (checkout.createdStoreIds.includes(request.storeId)) {
        const createdOrders = await Promise.all(checkout.createdOrderIds.map((orderId) => (
          this.db.collection<VirtualOrderDoc>(collections.virtualOrders).get(orderId)
        )));
        const existingStoreOrder = createdOrders.find((order) => (
          order?.storeId === request.storeId
          && order.idempotencyKey === request.idempotencyKey
          && order.accountId === (identity.accountId ?? null)
          && order.visitorId === (identity.visitorId ?? null)
        ));
        if (existingStoreOrder) {
          assertOrderRetryMatches(existingStoreOrder, request, identity);
          return this.toOrder(existingStoreOrder);
        }
        conflict('该商家订单已创建', 'STORE_ORDER_EXISTS');
      }
      const now = this.db.now().getTime();
      if (Date.parse(checkout.checkoutExpiresAt) <= now) conflict('结算已过期，请重新下单', 'CHECKOUT_EXPIRED');
      if (Date.parse(checkout.expiresAt) <= now) {
        conflict('报价已过期，请重新获取', 'QUOTE_EXPIRED');
      }
      const quotedStore = checkout.quote.stores.find((store) => store.storeId === request.storeId);
      const requestedStore = checkout.request.stores.find((store) => store.storeId === request.storeId);
      if (!quotedStore || !requestedStore || orderLinesFingerprint(request.lines) !== orderLinesFingerprint(requestedStore.lines)) {
        badRequest('订单商品与报价不一致', 'QUOTE_MISMATCH');
      }
      quote = quotedStore;
      effectiveRequest = {
        storeId: request.storeId,
        lines: requestedStore.lines,
        virtualDestinationId: checkout.request.virtualDestinationId,
        virtualDestinationPoint: checkout.request.virtualDestinationPoint,
        deliveryAddressSnapshot: checkout.request.deliveryAddressSnapshot,
      };
      if (quotedStore.minimumOrderShortfallCents > 0) {
        conflict('未达到起送金额，请补充商品', 'MINIMUM_ORDER_NOT_MET');
      }
      const currentQuote = await this.quoteStoreWithPromotions(
        effectiveRequest,
        this.db.now().toISOString(),
      );
      if (storePricingFingerprint(currentQuote) !== storePricingFingerprint(quotedStore)) {
        conflict('商品价格或优惠已变化，请重新获取报价', 'QUOTE_CHANGED');
      }
      firstCheckout = checkout.firstCheckout;
    } else {
      if (identity.visitorId && await this.db.collection<VirtualOrderDoc>(collections.virtualOrders)
        .findOne({ visitorId: identity.visitorId })) {
        unauthorized('游客仅可创建一次结算，请登录后继续', 'LOGIN_REQUIRED');
      }
      quote = await this.quote(request);
      firstCheckout = await this.db.collection<VirtualOrderDoc>(collections.virtualOrders).count(
        identity.accountId ? { accountId: identity.accountId } : { visitorId: identity.visitorId },
      ) === 0;
      idempotencyKey = `legacy_${randomUUID()}`;
      id = `order_${sha256(`${subjectKey}:${idempotencyKey}`).slice(0, 48)}`;
    }

    const store = await this.catalog.find(effectiveRequest.storeId);
    const gameplay = await this.gameplay.get();
    const startedAt = this.db.now();
    const incident = selectDeliveryIncident(
      id.slice(-12),
      store.virtualDeliveryMinutes,
      startedAt.getTime(),
      {
        rate: gameplay.deliveryIncidentRate,
        forceSuccess: gameplay.firstCheckoutGuaranteed && firstCheckout,
      },
    );
    const route = this.route(id, effectiveRequest.virtualDestinationPoint);
    const deliveryAddress = normalizeDeliveryAddressSnapshot(effectiveRequest.deliveryAddressSnapshot);
    const createdAt = startedAt.toISOString();
    const durationMs = virtualDeliveryDurationMs(store.virtualDeliveryMinutes, id);
    const completedAt = new Date(startedAt.getTime() + DELIVERY_START_MS + durationMs).toISOString();
    const easterEgg = incident
      ? undefined
      : selectOrderEasterEgg(id, id.slice(-12), completedAt, gameplay.successEggRate);
    const promotionDiscountCents = 'promotionDiscountCents' in quote
      ? quote.promotionDiscountCents
      : 0;
    const promotionSnapshots = 'promotionSnapshots' in quote
      ? quote.promotionSnapshots
      : [];
    const order: VirtualOrder = {
      ...quote,
      id,
      isVirtual: true,
      checkoutId: request.checkoutId ?? `legacy_checkout_${id.slice(6)}`,
      quoteId: request.quoteId ?? `legacy_quote_${id.slice(6)}`,
      idempotencyKey,
      visitorId: identity.visitorId,
      accountId: identity.accountId,
      settlementMode: identity.accountId ? 'virtual_balance' : 'guest_simulation',
      virtualDestinationId: effectiveRequest.virtualDestinationId,
      storeName: store.name,
      deliveryAddress,
      paymentMethod: identity.accountId ? PAYMENT_METHOD : undefined,
      status: 'created',
      startedAt: createdAt,
      createdAt,
      durationMs,
      seed: id.slice(-12),
      route,
      incident,
      failedAt: incident?.failedAt,
      refundStatus: incident && identity.accountId ? 'pending' : undefined,
      promotionDiscountCents,
      promotionSnapshots,
      fundsNotice: VIRTUAL_FUNDS_NOTICE,
      easterEgg,
    };
    const saved = await this.db.transaction(async (tx) => {
      const orders = tx.collection<VirtualOrderDoc>(collections.virtualOrders);
      const duplicate = await orders.get(id);
      if (duplicate) {
        assertOrderRetryMatches(duplicate, request, identity);
        return duplicate;
      }
      const now = tx.now().toISOString();
      let persistedCheckout: CheckoutSessionDoc | null = null;
      if (checkout) {
        const currentCheckout = await tx.collection<CheckoutSessionDoc>(collections.checkoutSessions).get(checkout.id);
        if (!currentCheckout || currentCheckout.quoteId !== checkout.quoteId
          || Date.parse(currentCheckout.checkoutExpiresAt) <= tx.now().getTime()) {
          conflict('结算已过期，请重新下单', 'CHECKOUT_EXPIRED');
        }
        if (Date.parse(currentCheckout.expiresAt) <= tx.now().getTime()) {
          conflict('报价已过期，请重新获取', 'QUOTE_EXPIRED');
        }
        if (currentCheckout.createdStoreIds.includes(order.storeId)) {
          conflict('该商家订单已创建', 'STORE_ORDER_EXISTS');
        }
        persistedCheckout = currentCheckout;
      }
      const row = await orders.insert({
        _id: id,
        id,
        checkoutId: order.checkoutId ?? null,
        quoteId: order.quoteId ?? null,
        idempotencyKey,
        subjectKey,
        requestFingerprint: orderCreateFingerprint(request),
        legacyCreate,
        visitorId: identity.visitorId ?? null,
        accountId: identity.accountId ?? null,
        settlementMode: order.settlementMode,
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
        promotionDiscountCents,
        promotionSnapshots,
        lines: order.lines,
        route: order.route,
        incidentKey: incident?.key ?? null,
        incidentStartedAt: incident?.startedAt ?? null,
        failedAt: incident?.failedAt ?? null,
        refundedAt: null,
        easterEgg: easterEgg ?? null,
        adminStatus: 'normal',
        adminNote: '',
        createdAt: order.createdAt,
        updatedAt: now,
      });
      if (identity.accountId) {
        await this.wallet.debitOrder(tx, identity.accountId, order.totalCents, id);
      }
      if (checkout && persistedCheckout) {
        await tx.collection<CheckoutSessionDoc>(collections.checkoutSessions).update(checkout.id, {
          createdOrderIds: [...persistedCheckout.createdOrderIds, id],
          createdStoreIds: [...persistedCheckout.createdStoreIds, order.storeId],
          updatedAt: now,
        });
      } else {
        const eventId = `legacy_order_create_${id}`;
        await tx.collection<AnalyticsEventDoc>(collections.analyticsEvents).insert({
          _id: eventId,
          id: eventId,
          visitorId: identity.visitorId ?? null,
          accountId: identity.accountId ?? null,
          eventName: 'legacy.order_create',
          payload: { orderId: id, storeId: order.storeId },
          createdAt: now,
        });
      }
      return row;
    });
    return this.toOrder(saved);
  }

  private async quoteStoreWithPromotions(
    request: QuoteRequest,
    quotedAt: string,
  ): Promise<CheckoutStoreQuote> {
    const [base, activePromotions] = await Promise.all([
      this.baseQuote(request),
      this.promotions.activeForStore(request.storeId, quotedAt),
    ]);
    const { quote: baseQuote, store } = base;
    const lines = baseQuote.lines.map((line) => ({ ...line }));
    const snapshots: PromotionSnapshot[] = [];
    let flashDiscountCents = 0;

    for (const promotion of activePromotions.filter((row) => row.type === 'item_flash')) {
      const line = lines.find((candidate) => candidate.menuItemId === promotion.menuItemId);
      const item = store.menu.find((candidate) => candidate.id === promotion.menuItemId);
      if (!line || !item || promotion.flashPriceCents === undefined) continue;
      const optionPriceCents = line.unitPriceCents - item.basePriceCents;
      const appliedPriceCents = Math.max(0, promotion.flashPriceCents + optionPriceCents);
      if (appliedPriceCents >= line.unitPriceCents) continue;
      const originalPriceCents = line.unitPriceCents;
      const discountCents = (originalPriceCents - appliedPriceCents) * line.quantity;
      line.unitPriceCents = appliedPriceCents;
      line.totalCents = appliedPriceCents * line.quantity;
      flashDiscountCents += discountCents;
      snapshots.push({
        promotionId: promotion.id,
        name: promotion.name,
        type: promotion.type,
        storeId: promotion.storeId,
        menuItemId: promotion.menuItemId,
        originalPriceCents,
        appliedPriceCents,
        discountCents,
        startsAt: promotion.startsAt,
        endsAt: promotion.endsAt,
      });
    }

    const itemsTotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
    const minimumOrderShortfallCents = Math.max(0, store.minimumOrderCents - baseQuote.itemsTotalCents);
    const threshold = bestThresholdDiscount(activePromotions, itemsTotalCents);
    if (threshold) snapshots.push(threshold.snapshot);
    const promotionDiscountCents = flashDiscountCents + (threshold?.discountCents ?? 0);
    const totalCents = Math.max(
      0,
      itemsTotalCents + store.deliveryFeeCents + store.packingFeeCents - (threshold?.discountCents ?? 0),
    );
    return {
      storeId: store.id,
      storeName: store.name,
      lines,
      originalItemsTotalCents: baseQuote.itemsTotalCents,
      itemsTotalCents,
      deliveryFeeCents: store.deliveryFeeCents,
      packingFeeCents: store.packingFeeCents,
      minimumOrderCents: store.minimumOrderCents,
      minimumOrderShortfallCents,
      flashDiscountCents,
      storeDiscountCents: threshold?.discountCents ?? 0,
      promotionDiscountCents,
      promotionSnapshots: snapshots,
      totalCents,
      itemsTotalCaloriesKcal: baseQuote.itemsTotalCaloriesKcal,
    };
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

  async listPage(
    visitorId?: string,
    accountId?: string,
    rawLimit?: string,
    rawCursor?: string,
  ): Promise<CursorPage<VirtualOrder>> {
    if (!visitorId && !accountId) return { items: [], nextCursor: null };
    const limit = Math.min(50, Math.max(1, Number.parseInt(rawLimit ?? '', 10) || 20));
    const subjectKey = identitySubject({ visitorId, accountId });
    const cursor = decodeOrderCursor(rawCursor, subjectKey);
    const identityWhere = accountId ? { accountId } : { visitorId };
    const rows = await this.db.collection<VirtualOrderDoc>(collections.virtualOrders).list({
      where: cursor
        ? {
          ...identityWhere,
          $or: [
            { createdAt: { $lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { $lt: cursor.id } },
          ],
        }
        : identityWhere,
      orderBy: [['createdAt', 'desc'], ['id', 'desc']],
      limit: limit + 1,
    });
    const hasMore = rows.length > limit;
    const visibleRows: VirtualOrderDoc[] = [];
    for (const row of rows.slice(0, limit)) {
      if (isRefundDue(row)) await this.refundFailedOrder(row.id);
      visibleRows.push((await this.db.collection<VirtualOrderDoc>(collections.virtualOrders).get(row.id)) ?? row);
    }
    return {
      items: visibleRows.map((row) => this.toOrder(row)),
      nextCursor: hasMore && visibleRows.length
        ? encodeOrderCursor(visibleRows.at(-1)!, subjectKey)
        : null,
    };
  }

  async merge(visitorId: string, accountId: string, db = this.db): Promise<{ merged: number }> {
    const orders = db.collection<VirtualOrderDoc>(collections.virtualOrders);
    const rows = await orders.list({ where: { visitorId } });
    await Promise.all(rows.map((row) => orders.update(row.id, { visitorId: null, accountId, updatedAt: db.now().toISOString() })));
    const checkoutSessions = db.collection<CheckoutSessionDoc>(collections.checkoutSessions);
    const sessions = await checkoutSessions.list({ where: { visitorId } });
    await Promise.all(sessions.map((session) => checkoutSessions.update(session.id, {
      visitorId: null,
      accountId,
      subjectKey: `account:${accountId}`,
      updatedAt: db.now().toISOString(),
    })));
    return { merged: rows.length + sessions.length };
  }

  async savings(accountId?: string): Promise<AccountSavings> {
    const stats = await this.gameStats(accountId);
    return {
      savedMoneyCents: stats.simulatedOrderAmountCents,
      savedCaloriesKcal: stats.simulatedCaloriesKcal,
      completedOrderCount: stats.completedOrderCount,
      deprecated: true,
      replacement: '/v1/accounts/me/game-stats',
    };
  }

  async gameStats(accountId?: string): Promise<AccountGameStats> {
    if (!accountId) {
      return {
        totalOrderCount: 0,
        completedOrderCount: 0,
        failedOrderCount: 0,
        simulatedOrderAmountCents: 0,
        simulatedCaloriesKcal: 0,
      };
    }
    await this.settleFailedOrders(accountId);
    const rows = await listAll(
      this.db.collection<VirtualOrderDoc>(collections.virtualOrders),
      { where: { accountId }, orderBy: [['createdAt', 'asc']] },
    );
    const completed = rows.filter((row) => this.currentStatus(row) === 'completed');
    const failed = rows.filter((row) => this.currentStatus(row) === 'failed');
    return {
      totalOrderCount: rows.length,
      completedOrderCount: completed.length,
      failedOrderCount: failed.length,
      simulatedOrderAmountCents: completed.reduce((sum, row) => sum + row.totalCents, 0),
      simulatedCaloriesKcal: completed.reduce((sum, row) => sum + row.itemsTotalCaloriesKcal, 0),
      firstOrderAt: rows[0]?.createdAt,
      lastOrderAt: rows.at(-1)?.createdAt,
    };
  }

  async settleFailedOrders(accountId?: string, orderId?: string): Promise<void> {
    if (orderId) {
      await this.refundFailedOrder(orderId);
      return;
    }
    const rows = await listAll(this.db.collection<VirtualOrderDoc>(collections.virtualOrders), {
      where: accountId ? { accountId } : {},
      orderBy: [['failedAt', 'desc']],
    });
    for (const order of rows.filter(isRefundDue)) await this.refundFailedOrder(order.id);
  }

  async settleFailedOrdersBatch(limit = 100): Promise<{ processed: number; refunded: number; hasMore: boolean }> {
    const safeLimit = Math.min(200, Math.max(1, Math.trunc(limit)));
    const candidates: VirtualOrderDoc[] = [];
    const orders = this.db.collection<VirtualOrderDoc>(collections.virtualOrders);
    const pageSize = 100;
    let skip = 0;
    let reachedEnd = false;
    while (candidates.length <= safeLimit && !reachedEnd) {
      const page = await orders.list({
        orderBy: [['failedAt', 'desc']],
        skip,
        limit: pageSize,
      });
      candidates.push(...page.filter(isRefundDue));
      reachedEnd = page.length < pageSize;
      skip += pageSize;
    }
    const batch = candidates.slice(0, safeLimit);
    let refunded = 0;
    for (const order of batch) {
      if (await this.refundFailedOrder(order.id)) refunded += 1;
    }
    return {
      processed: batch.length,
      refunded,
      hasMore: candidates.length > safeLimit || !reachedEnd,
    };
  }

  private async refundFailedOrder(orderId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const orders = tx.collection<VirtualOrderDoc>(collections.virtualOrders);
      const order = await orders.get(orderId);
      if (!order || !isRefundDue(order) || !order.accountId) return false;
      const account = await tx.collection<AccountDoc>(collections.accounts).get(order.accountId);
      if (!account) return false;
      const refunds = tx.collection<WalletTransactionDoc>(collections.walletTransactions);
      const refundId = `order_refund_${order.id}`;
      if (await refunds.get(refundId)) {
        if (!order.refundedAt) {
          await orders.update(order.id, {
            status: 'failed',
            refundedAt: tx.now().toISOString(),
            updatedAt: tx.now().toISOString(),
          });
        }
        return false;
      }
      const balanceCents = account.balanceCents + order.totalCents;
      await tx.collection<AccountDoc>(collections.accounts).update(account.id, {
        balanceCents,
        updatedAt: tx.now().toISOString(),
      });
      await refunds.insert(walletTx(tx, account.id, 'order_refund', order.totalCents, balanceCents, '虚拟配送失败退款', {
        _id: refundId,
        id: refundId,
        orderId: order.id,
      }));
      await orders.update(order.id, {
        status: 'failed',
        refundedAt: tx.now().toISOString(),
        updatedAt: tx.now().toISOString(),
      });
      return true;
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
      checkoutId: row.checkoutId ?? undefined,
      quoteId: row.quoteId ?? undefined,
      idempotencyKey: row.idempotencyKey ?? undefined,
      visitorId: row.visitorId ?? undefined,
      accountId: row.accountId ?? undefined,
      settlementMode: this.settlementMode(row),
      storeId: row.storeId,
      virtualDestinationId: row.destinationId,
      storeName: row.storeName ?? undefined,
      deliveryAddress: isDeliveryAddressSnapshot(row.deliveryAddress) ? row.deliveryAddress : undefined,
      paymentMethod: this.settlementMode(row) === 'virtual_balance' ? PAYMENT_METHOD : undefined,
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
      promotionDiscountCents: row.promotionDiscountCents ?? 0,
      promotionSnapshots: row.promotionSnapshots ?? [],
      fundsNotice: VIRTUAL_FUNDS_NOTICE,
      lines: row.lines as VirtualOrder['lines'],
      route: row.route as VirtualRoute,
      incident,
      failedAt: row.failedAt ?? undefined,
      refundStatus: incident && this.settlementMode(row) === 'virtual_balance'
        ? (row.refundedAt ? 'refunded' : 'pending')
        : undefined,
      easterEgg: this.currentStatus(row) === 'completed' ? row.easterEgg ?? undefined : undefined,
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

  private settlementMode(row: VirtualOrderDoc): VirtualOrder['settlementMode'] {
    return row.settlementMode === 'guest_simulation' || (!row.accountId && row.visitorId)
      ? 'guest_simulation'
      : 'virtual_balance';
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
    const validated = validateAddressInput(input);
    return this.db.transaction(async (tx) => {
      const addresses = tx.collection<AddressDoc>(collections.addresses);
      const id = validated.id || `addr_${randomUUID()}`;
      const existing = await addresses.get(id);
      if (existing && !belongsTo(existing, identity)) badRequest('无权修改该地址');
      const where = identity.accountId ? { accountId: identity.accountId } : { visitorId: identity.visitorId };
      const siblings = await addresses.list({ where });
      const isDefault = validated.isDefault || siblings.length === 0;
      if (isDefault) {
        await Promise.all(siblings.map((row) => addresses.update(row.id, { isDefault: false, updatedAt: tx.now().toISOString() })));
      }
      const now = tx.now().toISOString();
      const saved = await addresses.upsert(id, {
        ...existing,
        ...validated,
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
    return { merged: await mergeVisitorAddresses(db, visitorId, accountId) };
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
    if (!['order', 'order_egg', 'persona', 'achievement', 'invitation', 'reward'].includes(input?.kind)) badRequest('分享类型不正确', 'INVALID_SHARE_KIND');
    return this.db.transaction(async (tx) => {
      const config = await this.config(tx);
      if (isRewardShare(input.kind) && !config.enabled) badRequest('分享活动暂未开放', 'SHARE_DISABLED');
      const snapshot = await this.snapshot(tx, accountId, input);
      const token = randomUUID().replace(/-/g, '');
      const titles = input.kind === 'order'
        ? config.orderTitles
        : input.kind === 'achievement'
          ? config.achievementTitles
          : config.invitationTitles;
      const persona = (snapshot as ShareInviteDoc['snapshot']).persona;
      const egg = (snapshot as ShareInviteDoc['snapshot']).easterEgg;
      const title = input.kind === 'order_egg' && egg
        ? `我发现了${egg.rarity === 'legendary' ? '传说' : egg.rarity === 'rare' ? '稀有' : '普通'}彩蛋：${egg.name}`
        : input.kind === 'persona' && persona
        ? `我的这顿白吃人格是 ${persona.acronym} · ${persona.name}`
        : chooseShareTitle(titles, input.orderId ?? `${accountId}:${shanghaiBusinessDate()}`).replace('{count}', String(snapshot.completedOrderCount));
      await tx.collection<ShareInviteDoc>(collections.shareInvites).insert({
        _id: token,
        token,
        inviterAccountId: accountId,
        kind: input.kind,
        orderId: input.orderId ?? null,
        title,
        snapshot,
        initiatedRewardGranted: false,
        completedAt: null,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: tx.now().toISOString(),
      });
      return {
        token,
        kind: input.kind,
        title,
        path: buildSharePath(token, input.kind),
        initiatedRewardCents: isRewardShare(input.kind) ? config.initiatedRewardCents : 0,
        initiatedRewardGranted: false,
      };
    });
  }

  async rewardInitiatedShare(accountId: string, token: string): Promise<ShareRewardResult> {
    return this.db.transaction(async (tx) => {
      const config = await this.config(tx);
      const invite = await tx.collection<ShareInviteDoc>(collections.shareInvites).get(token);
      const account = await tx.collection<AccountDoc>(collections.accounts).get(accountId);
      if (!account) notFound('用户不存在', 'ACCOUNT_NOT_FOUND');
      if (!config.enabled || !invite || !isRewardShare(invite.kind) || invite.inviterAccountId !== accountId || invite.initiatedRewardGranted || new Date(invite.expiresAt).getTime() <= Date.now()) {
        return { granted: false, amountCents: 0, balanceCents: account.balanceCents };
      }
      const rewardedAt = tx.now().toISOString();
      const businessDate = shanghaiBusinessDate(tx.now());
      const dailyId = `share_reward_daily_${sha256(`${accountId}:${businessDate}`).slice(0, 40)}`;
      const dailyRewards = tx.collection<ShareRewardDailyDoc>(collections.shareRewardDaily);
      const daily = await dailyRewards.get(dailyId);
      if ((daily?.grantedCount ?? 0) >= config.dailyInitiatedLimit || config.initiatedRewardCents <= 0) {
        return { granted: false, amountCents: 0, balanceCents: account.balanceCents };
      }
      const transactionId = `share_initiated_${sha256(`${accountId}:${token}`).slice(0, 40)}`;
      const summary = await this.wallet.credit(
        accountId,
        config.initiatedRewardCents,
        'share_initiated',
        '朋友圈分享奖励（虚拟饭钱，不可提现）',
        tx,
        {
          _id: transactionId,
          id: transactionId,
          businessDate,
        },
      );
      const nextDaily: ShareRewardDailyDoc = {
        _id: dailyId,
        id: dailyId,
        accountId,
        businessDate,
        grantedCount: (daily?.grantedCount ?? 0) + 1,
        totalAmountCents: (daily?.totalAmountCents ?? 0) + config.initiatedRewardCents,
        updatedAt: rewardedAt,
      };
      if (daily) await dailyRewards.update(dailyId, nextDaily);
      else await dailyRewards.insert(nextDaily);
      await tx.collection<ShareInviteDoc>(collections.shareInvites).update(token, {
        initiatedRewardGranted: true,
        initiatedRewardGrantedAt: rewardedAt,
        rewardedAt,
        rewardBusinessDate: businessDate,
      });
      return {
        granted: true,
        amountCents: config.initiatedRewardCents,
        balanceCents: summary.balanceCents,
        rewardedAt,
        businessDate,
      };
    });
  }

  async landing(token: string): Promise<ShareLanding> {
    const config = await this.config();
    const invite = await this.db.collection<ShareInviteDoc>(collections.shareInvites).get(token);
    if (!invite) {
      return { active: false, dishNames: [], savedMoneyCents: 0, savedCaloriesKcal: 0, completedOrderCount: 0, inviteeRewardCents: 0, benefitText: BENEFIT_TEXT };
    }
    const safeInvite = sanitizeShareInviteCopy(invite);
    const kind = safeInvite.kind === 'invitation' ? 'reward' : safeInvite.kind;
    const active = new Date(safeInvite.expiresAt).getTime() > Date.now() && (!isRewardShare(safeInvite.kind) || config.enabled);
    const miniProgramCodeUrl = active ? await createShareMiniProgramCode(token, sharePagePath(kind).slice(1)) : undefined;
    const identity = safeInvite.snapshot.identity;
    const avatarUrls = await resolveCloudFileUrls([identity?.avatarUrl]);
    const resolvedIdentity = identity ? {
      ...identity,
      avatarUrl: identity.avatarUrl ? avatarUrls.get(identity.avatarUrl) ?? identity.avatarUrl : '',
    } : undefined;
    return {
      active,
      expired: !active,
      kind,
      title: safeInvite.title,
      ...safeInvite.snapshot,
      identity: resolvedIdentity,
      miniProgramCodeUrl,
      inviteeRewardCents: active && isRewardShare(safeInvite.kind) ? config.inviteeRewardCents : 0,
      benefitText: isRewardShare(safeInvite.kind) ? BENEFIT_TEXT : '',
    };
  }

  async completeReferral(inviteeAccountId: string, token?: string): Promise<void> {
    if (!token) return;
    await this.db.transaction(async (tx) => {
      const config = await this.config(tx);
      if (!config.enabled) return;
      const invite = await tx.collection<ShareInviteDoc>(collections.shareInvites).get(token);
      if (!invite || !isRewardShare(invite.kind) || invite.completedAt || new Date(invite.expiresAt).getTime() <= Date.now()) return;
      if (invite.inviterAccountId === inviteeAccountId) return;
      if (await tx.collection<ShareInviteDoc>(collections.shareInvites).findOne({ inviteeAccountId })) return;
      if (config.inviterRewardCents) await this.wallet.credit(invite.inviterAccountId, config.inviterRewardCents, 'referral_inviter', '好友首次登录奖励（虚拟饭钱，不可提现）', tx);
      if (config.inviteeRewardCents) await this.wallet.credit(inviteeAccountId, config.inviteeRewardCents, 'referral_invitee', '首次受邀登录奖励（虚拟饭钱，不可提现）', tx);
      await tx.collection<ShareInviteDoc>(collections.shareInvites).update(token, { inviteeAccountId, completedAt: tx.now().toISOString() });
    });
  }

  private async snapshot(db: Database, accountId: string, input: ShareCreateRequest) {
    const orders = db.collection<VirtualOrderDoc>(collections.virtualOrders);
    const account = await db.collection<AccountDoc>(collections.accounts).get(accountId);
    const identity = input.showIdentity === false ? undefined : {
      nickname: publicAccountNickname(account),
      avatarUrl: account?.avatarUrl || '',
    };
    if (input.kind === 'order' || input.kind === 'order_egg') {
      if (!input.orderId) badRequest('请选择要分享的订单', 'ORDER_REQUIRED');
      const order = await orders.get(input.orderId);
      if (!order || order.accountId !== accountId) notFound('订单不存在', 'ORDER_NOT_FOUND');
      const deliveredAt = new Date(order.startedAt).getTime() + DELIVERY_START_MS + order.durationMs;
      const incidentPhase = order.incidentKey && order.incidentStartedAt && order.failedAt
        ? getDeliveryIncidentPhase({
          key: order.incidentKey as DeliveryIncidentKey,
          startedAt: order.incidentStartedAt,
          failedAt: order.failedAt,
        })
        : 'pending';
      const shareableIncident = Boolean(
        order.incidentKey && incidentPhase !== 'pending',
      );
      const canShareFailedIncidentOrder = incidentPhase === 'failed';
      if (input.kind === 'order' && !canShareFailedIncidentOrder && (order.status === 'failed' || Date.now() < deliveredAt)) {
        badRequest('订单送达后才能分享', 'ORDER_NOT_COMPLETED');
      }
      const incidentEgg = order.incidentKey && order.incidentStartedAt
        ? deliveryIncidentShareEgg(order.incidentKey as DeliveryIncidentKey, order.seed, order.incidentStartedAt)
        : undefined;
      const easterEgg = order.easterEgg ?? (shareableIncident ? incidentEgg : undefined);
      if (input.kind === 'order_egg' && !easterEgg) badRequest('当前订单没有可分享的彩蛋', 'EASTER_EGG_REQUIRED');
      return {
        identity,
        storeName: order.storeName || '神秘小馆',
        orderLines: order.lines as VirtualOrder['lines'],
        dishNames: (order.lines as VirtualOrder['lines']).map((line) => line.name),
        // Compatibility field name: share clients present this value as the
        // order amount, regardless of guest/account settlement.
        savedMoneyCents: order.totalCents,
        savedCaloriesKcal: order.itemsTotalCaloriesKcal,
        completedOrderCount: 1,
        ...(input.kind === 'order_egg' ? { easterEgg } : {}),
        posterTheme: input.kind === 'order_egg' ? 'order_egg' as const : 'order' as const,
      };
    }
    const rows = (await orders.list({ where: { accountId } })).filter((order) => (
      order.status !== 'failed' && Date.now() >= new Date(order.startedAt).getTime() + DELIVERY_START_MS + order.durationMs
    ));
    const savedMoneyCents = rows.reduce((sum, order) => sum + order.totalCents, 0);
    const savedCaloriesKcal = rows.reduce((sum, order) => sum + order.itemsTotalCaloriesKcal, 0);
    const completedOrderCount = rows.length;
    const allLines = rows.flatMap((order) => order.lines as VirtualOrder['lines']);
    if (isRewardShare(input.kind)) {
      return {
        identity,
        dishNames: [],
        savedMoneyCents: 0,
        savedCaloriesKcal: 0,
        completedOrderCount: 0,
        posterTheme: 'reward' as const,
      };
    }
    return {
      identity,
      dishNames: [],
      savedMoneyCents,
      savedCaloriesKcal,
      completedOrderCount,
      ...(input.kind === 'achievement'
        ? { milestone: selectMilestone(completedOrderCount, savedMoneyCents, savedCaloriesKcal), posterTheme: 'achievement' as const }
        : { persona: classifyPersona(allLines, completedOrderCount, savedMoneyCents, savedCaloriesKcal), posterTheme: 'persona' as const }),
    };
  }
}

function isRewardShare(kind: ShareCreateRequest['kind']): boolean {
  return kind === 'reward' || kind === 'invitation';
}

function deliveryIncidentShareEgg(key: DeliveryIncidentKey, seed: string, triggeredAt: string): OrderEasterEgg {
  const incident = findDeliveryIncident(key);
  const collectionNumber = String(Math.abs(seed.split('').reduce((sum, char) => (
    ((sum << 5) - sum + char.charCodeAt(0)) | 0
  ), 0)) % 10000).padStart(4, '0');
  return {
    id: `incident-${key}`,
    name: incident.failedText,
    rarity: 'rare',
    verdict: incident.activeText,
    themeColor: '#F04B32',
    decoration: 'delivery-incident',
    collectionNumber,
    triggeredAt,
  };
}

function virtualDeliveryDurationMs(minutes: number, seed: string): number {
  const normalized = Math.min(1, Math.max(0, (minutes - 18) / 27));
  const base = MIN_DELIVERY_DURATION_MS + Math.round((MAX_DELIVERY_DURATION_MS - MIN_DELIVERY_DURATION_MS) * normalized);
  const jitter = Math.abs(seed.split('').reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) | 0, 0)) % 8_000;
  return Math.min(MAX_DELIVERY_DURATION_MS, base + jitter);
}

function identitySubject(identity: { visitorId?: string; accountId?: string }): string {
  if (identity.accountId) return `account:${identity.accountId}`;
  if (identity.visitorId) return `visitor:${identity.visitorId}`;
  unauthorized();
}

function validateCheckoutIdentifier(value: string, name: string): void {
  if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(value)) badRequest(`${name} 格式不正确`, 'INVALID_CHECKOUT');
}

function anonymizedDeliveryAddress(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return {
    ...(value as Record<string, unknown>),
    name: '已注销用户',
    phone: '',
    address: '',
    detail: '',
    tag: '',
  };
}

function anonymizedVirtualRoute(): VirtualRoute {
  const point: GeoPoint = { lat: 0, lng: 0, coordSystem: 'gcj02' };
  return {
    id: 'deleted-account-route',
    cityCode: '',
    origin: point,
    destination: point,
    polyline: [],
    routeSource: 'generated',
    label: '虚拟配送路线',
  };
}

function validateIdempotencyKey(value: string): void {
  if (!/^[a-zA-Z0-9._:-]{8,120}$/.test(value)) badRequest('idempotencyKey 格式不正确', 'INVALID_IDEMPOTENCY_KEY');
}

function encodeOrderCursor(order: Pick<VirtualOrderDoc, 'createdAt' | 'id'>, subjectKey: string): string {
  return Buffer.from(JSON.stringify({
    createdAt: order.createdAt,
    id: order.id,
    subject: sha256(subjectKey).slice(0, 16),
  })).toString('base64url');
}

function decodeOrderCursor(
  cursor: string | undefined,
  subjectKey: string,
): Pick<VirtualOrderDoc, 'createdAt' | 'id'> | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      createdAt?: unknown;
      id?: unknown;
      subject?: unknown;
    };
    if (typeof value.createdAt !== 'string'
      || !Number.isFinite(Date.parse(value.createdAt))
      || typeof value.id !== 'string'
      || !value.id
      || value.subject !== sha256(subjectKey).slice(0, 16)) {
      badRequest('订单游标无效', 'INVALID_CURSOR');
    }
    return { createdAt: value.createdAt, id: value.id };
  } catch (error) {
    if (isCloudApiError(error)) throw error;
    badRequest('订单游标无效', 'INVALID_CURSOR');
  }
}

function orderLinesFingerprint(lines: QuoteRequest['lines']): string {
  if (!Array.isArray(lines)) return '';
  return JSON.stringify(lines.map((line) => ({
    menuItemId: line.menuItemId,
    optionIds: [...(line.optionIds ?? [])].sort(),
    quantity: line.quantity,
  })).sort((left, right) => (
    left.menuItemId.localeCompare(right.menuItemId)
    || JSON.stringify(left.optionIds).localeCompare(JSON.stringify(right.optionIds))
  )));
}

function storePricingFingerprint(quote: CheckoutStoreQuote): string {
  return JSON.stringify({
    storeId: quote.storeId,
    lines: quote.lines.map((line) => ({
      menuItemId: line.menuItemId,
      optionNames: line.optionNames,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      totalCents: line.totalCents,
      unitCaloriesKcal: line.unitCaloriesKcal,
      totalCaloriesKcal: line.totalCaloriesKcal,
    })),
    originalItemsTotalCents: quote.originalItemsTotalCents,
    itemsTotalCents: quote.itemsTotalCents,
    deliveryFeeCents: quote.deliveryFeeCents,
    packingFeeCents: quote.packingFeeCents,
    minimumOrderCents: quote.minimumOrderCents,
    minimumOrderShortfallCents: quote.minimumOrderShortfallCents,
    flashDiscountCents: quote.flashDiscountCents,
    storeDiscountCents: quote.storeDiscountCents,
    promotionSnapshots: quote.promotionSnapshots,
    totalCents: quote.totalCents,
  });
}

function assertOrderRetryMatches(
  order: VirtualOrderDoc,
  request: OrderCreateRequest,
  identity: { visitorId?: string; accountId?: string },
): void {
  if (order.accountId !== (identity.accountId ?? null)
    || order.visitorId !== (identity.visitorId ?? null)
    || order.checkoutId !== (request.checkoutId ?? null)
    || order.quoteId !== (request.quoteId ?? null)
    || order.storeId !== request.storeId
    || order.idempotencyKey !== (request.idempotencyKey ?? null)
    || (order.requestFingerprint !== undefined
      && order.requestFingerprint !== null
      && order.requestFingerprint !== orderCreateFingerprint(request))) {
    conflict('幂等键已用于其他订单请求', 'IDEMPOTENCY_CONFLICT');
  }
}

function orderCreateFingerprint(request: OrderCreateRequest): string {
  return sha256(JSON.stringify({
    checkoutId: request.checkoutId ?? null,
    quoteId: request.quoteId ?? null,
    storeId: request.storeId,
    lines: orderLinesFingerprint(request.lines),
    virtualDestinationId: request.virtualDestinationId,
    virtualDestinationPoint: request.virtualDestinationPoint ?? null,
    deliveryAddressSnapshot: request.deliveryAddressSnapshot ?? null,
  }));
}

function bestThresholdDiscount(
  promotions: PromotionCampaign[],
  itemsTotalCents: number,
): { discountCents: number; snapshot: PromotionSnapshot } | undefined {
  const candidates = promotions
    .filter((promotion) => promotion.type === 'store_threshold')
    .flatMap((promotion) => (promotion.tiers ?? [])
      .filter((tier) => tier.thresholdCents <= itemsTotalCents)
      .map((tier) => ({ promotion, tier })))
    .sort((left, right) => (
      right.tier.thresholdCents - left.tier.thresholdCents
      || right.tier.discountCents - left.tier.discountCents
    ));
  const selected = candidates[0];
  if (!selected) return undefined;
  return {
    discountCents: selected.tier.discountCents,
    snapshot: {
      promotionId: selected.promotion.id,
      name: selected.promotion.name,
      type: selected.promotion.type,
      storeId: selected.promotion.storeId,
      thresholdCents: selected.tier.thresholdCents,
      discountCents: selected.tier.discountCents,
      startsAt: selected.promotion.startsAt,
      endsAt: selected.promotion.endsAt,
    },
  };
}

function isRefundDue(order: VirtualOrderDoc): boolean {
  return Boolean(
    order.failedAt
    && !order.refundedAt
    && Date.parse(order.failedAt) <= Date.now(),
  );
}

export class AnalyticsService {
  constructor(private readonly db: Database, private readonly auth: AuthService) {}

  async record(body: unknown, authorization?: string, openId?: string, webUid?: string) {
    const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const eventName = typeof input.eventName === 'string' ? input.eventName.trim() : '';
    if (!eventName || eventName.length > 64 || !/^[a-zA-Z0-9._-]+$/.test(eventName)) badRequest('eventName 格式不正确');
    const payload = input.payload && typeof input.payload === 'object' ? input.payload as Record<string, unknown> : {};
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 8_192) badRequest('埋点数据过大', 'PAYLOAD_TOO_LARGE');
    const sanitizedPayload = sanitizeForAuditLog(payload) as Record<string, unknown>;
    const identity = await this.auth.resolvePersistedIdentity(authorization, openId, webUid);
    const eventId = typeof input.eventId === 'string' ? input.eventId.trim() : '';
    if (eventId && !/^[a-zA-Z0-9._:-]{8,120}$/.test(eventId)) badRequest('eventId 格式不正确');
    const id = eventId || `event_${randomUUID()}`;
    if (await this.db.collection<AnalyticsEventDoc>(collections.analyticsEvents).get(id)) {
      return { recorded: true, deduplicated: true };
    }
    await this.db.collection<AnalyticsEventDoc>(collections.analyticsEvents).insert({
      _id: id,
      id,
      visitorId: identity.visitorId ?? null,
      accountId: identity.accountId ?? null,
      eventName,
      payload: sanitizedPayload,
      createdAt: this.db.now().toISOString(),
    });
    return { recorded: true };
  }
}

export class MapService {
  async reverseGeocode(lat: number, lng: number): Promise<AdministrativeArea> {
    validateCoordinates(lat, lng);
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
    validateCoordinates(lat, lng);
    const key = requireTencentMapKey();
    const params = new URLSearchParams({ keyword: '小区', boundary: `nearby(${lat},${lng},3000)`, page_size: '20', page_index: '1', key });
    return mapPlaces(`https://apis.map.qq.com/ws/place/v1/search/?${params.toString()}`);
  }

  async suggestPlaces(keyword: string, region?: string): Promise<PlaceSuggestion[]> {
    if (!keyword?.trim()) return [];
    if (keyword.trim().length > 80 || (region?.length ?? 0) > 40) badRequest('地点搜索参数过长');
    const key = requireTencentMapKey();
    const params = new URLSearchParams({ keyword: keyword.trim(), key, page_size: '10' });
    if (region) {
      params.set('region', region);
      params.set('region_fix', '1');
    }
    return mapPlaces(`https://apis.map.qq.com/ws/place/v1/suggestion/?${params.toString()}`);
  }
}

function validateCoordinates(lat: number, lng: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    badRequest('经纬度参数不正确');
  }
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
    description,
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
  const safeRow = sanitizeWalletTransactionCopy(row);
  return {
    id: safeRow.id,
    type: safeRow.type,
    amountCents: safeRow.amountCents,
    balanceAfterCents: safeRow.balanceAfterCents,
    orderId: safeRow.orderId ?? undefined,
    description: safeRow.description,
    createdAt: safeRow.createdAt,
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

function emptyAccountMergeSummary(): AccountMergeSummary {
  return {
    orders: 0,
    visitorSessions: 0,
    addresses: 0,
    walletTransactions: 0,
    shareInvites: 0,
    analyticsEvents: 0,
  };
}

async function mergeVisitorAddresses(db: Database, visitorId: string, accountId: string): Promise<number> {
  const addresses = db.collection<AddressDoc>(collections.addresses);
  const [sourceRows, targetRows] = await Promise.all([
    listAll(addresses, { where: { visitorId }, orderBy: [['createdAt', 'asc']] }),
    listAll(addresses, { where: { accountId }, orderBy: [['createdAt', 'asc']] }),
  ]);
  return mergeAddressRows(db, sourceRows, targetRows, accountId);
}

async function mergeAccountAddresses(db: Database, sourceAccountId: string, targetAccountId: string): Promise<number> {
  const addresses = db.collection<AddressDoc>(collections.addresses);
  const [sourceRows, targetRows] = await Promise.all([
    listAll(addresses, { where: { accountId: sourceAccountId }, orderBy: [['createdAt', 'asc']] }),
    listAll(addresses, { where: { accountId: targetAccountId }, orderBy: [['createdAt', 'asc']] }),
  ]);
  return mergeAddressRows(db, sourceRows, targetRows, targetAccountId);
}

async function mergeAddressRows(
  db: Database,
  sourceRows: AddressDoc[],
  targetRows: AddressDoc[],
  targetAccountId: string,
): Promise<number> {
  if (!sourceRows.length) return 0;
  const addresses = db.collection<AddressDoc>(collections.addresses);
  const rowsByKey = new Map(targetRows.map((row) => [addressMergeKey(row), row]));
  const targetDefault = targetRows.find((row) => row.isDefault);
  let preferredDefaultId = targetDefault?.id;

  for (const row of sourceRows) {
    const duplicate = rowsByKey.get(addressMergeKey(row));
    if (duplicate) {
      if (!preferredDefaultId && row.isDefault) preferredDefaultId = duplicate.id;
      await addresses.remove(row.id);
      continue;
    }
    await addresses.update(row.id, {
      visitorId: null,
      accountId: targetAccountId,
      isDefault: false,
      updatedAt: db.now().toISOString(),
    });
    rowsByKey.set(addressMergeKey(row), { ...row, visitorId: null, accountId: targetAccountId, isDefault: false });
    if (!preferredDefaultId && row.isDefault) preferredDefaultId = row.id;
  }

  const mergedRows = await addresses.list({
    where: { accountId: targetAccountId },
    orderBy: [['createdAt', 'asc']],
  });
  preferredDefaultId ??= mergedRows[0]?.id;
  for (const row of mergedRows) {
    const shouldBeDefault = row.id === preferredDefaultId;
    if (row.isDefault !== shouldBeDefault) {
      await addresses.update(row.id, { isDefault: shouldBeDefault, updatedAt: db.now().toISOString() });
    }
  }
  return sourceRows.length;
}

function addressMergeKey(row: Pick<AddressDoc, 'phone' | 'address' | 'detail'>): string {
  return [row.phone, row.address, row.detail]
    .map((value) => value.trim().replace(/\s+/g, ' ').toLowerCase())
    .join('\n');
}

function publicAccountNickname(account: AccountDoc | null): string {
  if (!account) return '一位白吃选手';
  if (account.phoneNumber && (!account.wechatOpenIdHash || account.nickname === account.phoneNumber)) {
    return maskPhoneNumber(account.phoneNumber);
  }
  return account.nickname || '一位白吃选手';
}

export function normalizeChinaPhone(input: string): string {
  const compact = String(input ?? '').trim().replace(/[\s-]/g, '');
  const national = compact.startsWith('+86')
    ? compact.slice(3)
    : compact.startsWith('86') && compact.length === 13
      ? compact.slice(2)
      : compact;
  if (!/^1[3-9]\d{9}$/.test(national)) {
    badRequest('仅支持中国大陆 +86 手机号', 'INVALID_PHONE_NUMBER');
  }
  return national;
}

export function maskPhoneNumber(input: string): string {
  const phone = normalizeChinaPhone(input);
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function guestSessionId(accessToken: string): string {
  return `guest_session_${sha256(accessToken)}`;
}

function validateProfile(profile: UserProfile | undefined, code: string) {
  const avatarUrl = profile?.avatarUrl?.trim();
  const nickname = profile?.nickname?.trim();
  if (!code?.trim() || code.trim().length > 256 || !avatarUrl || avatarUrl.length > 1_000 || !nickname || nickname.length > 32) {
    badRequest('登录资料不完整');
  }
  if (!/^(cloud:\/\/|https:\/\/)/.test(avatarUrl)) badRequest('头像地址不受信任', 'INVALID_AVATAR_URL');
  return { avatarUrl, nickname };
}

function validateAddressInput(input: Omit<Address, 'id'> & { id?: string }) {
  if (!input || typeof input !== 'object') badRequest('地址格式不正确', 'INVALID_ADDRESS');
  const id = input.id?.trim();
  if (id && !/^addr_[a-zA-Z0-9-]{1,80}$/.test(id)) badRequest('地址 ID 格式不正确', 'INVALID_ADDRESS');
  if (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90 || !Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180) {
    badRequest('地址坐标不正确', 'INVALID_ADDRESS');
  }
  return {
    ...(id ? { id } : {}),
    ...validateAddressText(input),
    lat: input.lat,
    lng: input.lng,
    isDefault: input.isDefault === true,
  };
}

function validateAddressText(input: Pick<OrderDeliveryAddressSnapshot, 'name' | 'phone' | 'address' | 'detail' | 'tag'>) {
  const name = String(input.name ?? '').trim();
  const phone = String(input.phone ?? '').trim();
  const address = String(input.address ?? '').trim();
  const detail = String(input.detail ?? '').trim();
  const tag = String(input.tag ?? '').trim();
  if (!name || name.length > 40) badRequest('联系人姓名格式不正确', 'INVALID_ADDRESS');
  if (!/^\+?[0-9 -]{6,20}$/.test(phone)) badRequest('联系电话格式不正确', 'INVALID_ADDRESS');
  if (!address || address.length > 200 || detail.length > 200 || tag.length > 20) badRequest('地址内容格式不正确', 'INVALID_ADDRESS');
  return { name, phone, address, detail, tag };
}

function requireTencentMapKey(): string {
  const key = process.env.TENCENT_MAP_KEY;
  if (!key) badRequest('尚未配置腾讯位置服务 Key', 'MAP_KEY_MISSING');
  return key;
}

async function mapGet<T>(url: string): Promise<T> {
  const response = await fetchWithTimeout(
    url,
    {},
    { label: '地图服务', timeoutMs: 4_000, retries: 1 },
  );
  const body = await response.json() as T & { message?: string };
  if (!response.ok) badRequest(mapErrorMessage(body));
  return body;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  options: { label: string; timeoutMs: number; retries?: number },
): Promise<Response> {
  const attempts = Math.max(1, (options.retries ?? 0) + 1);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (response.status >= 500 && attempt + 1 < attempts) continue;
      return response;
    } catch {
      if (attempt + 1 >= attempts) {
        serviceUnavailable(`${options.label}暂不可用，请稍后重试`, 'UPSTREAM_UNAVAILABLE');
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  serviceUnavailable(`${options.label}暂不可用，请稍后重试`, 'UPSTREAM_UNAVAILABLE');
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
