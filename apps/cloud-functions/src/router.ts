import { AdminCloudServices, requireAdmin } from './admin-services';
import { createCloudBaseDatabase, type Database } from './database';
import { badRequest, forbidden, notFound, toErrorBody, unauthorized } from './errors';
import { BaichileCloudServices } from './services';
import type { CloudFunctionEvent, RequestContext } from './types';
import { PersistentRateLimiter } from './rate-limit';

export class BaichileRouter {
  private readonly services: BaichileCloudServices;
  private readonly admin: AdminCloudServices;
  private readonly rateLimits: PersistentRateLimiter;

  constructor(
    private readonly db: Database = createCloudBaseDatabase(),
    private readonly surface: 'public' | 'admin' | 'all' = 'all',
  ) {
    this.services = new BaichileCloudServices(db);
    this.admin = new AdminCloudServices(db);
    this.rateLimits = new PersistentRateLimiter(db);
  }

  async handle(event: CloudFunctionEvent, rawContext?: any) {
    const request = normalizeRequest(event, rawContext);
    try {
      const data = await this.route(request);
      return { ok: true, status: 200, data };
    } catch (error) {
      return toErrorBody(error);
    }
  }

  private async route(request: RequestContext): Promise<unknown> {
    const path = request.path.replace(/^\/+/, '/');
    const segments = path.split('/').filter(Boolean);
    if (segments[0] !== 'v1') badRequest('接口路径不正确');

    if (segments[1] === 'admin') {
      if (this.surface === 'public') notFound('接口不存在', 'NOT_FOUND');
      this.requireAllowedAdminOrigin(request.origin);
      return this.routeAdmin(request, segments.slice(2));
    }

    if (this.surface === 'admin' && path !== '/v1/health') notFound('接口不存在', 'NOT_FOUND');

    if (request.method === 'GET' && path === '/v1/health') return { status: 'ok', service: 'baichile-cloud-functions' };
    if (request.method === 'POST' && path === '/v1/auth/guest') {
      await this.enforceRateLimit(`guest:${request.ipAddress ?? request.openId ?? 'unknown'}`, 20, 60 * 60_000);
      return this.services.auth.createGuest();
    }
    if (request.method === 'POST' && path === '/v1/auth/wechat-mini') {
      if (!request.openId) unauthorized('仅允许微信小程序登录', 'WECHAT_CONTEXT_REQUIRED');
      const guestIdentity = await this.services.auth.resolvePersistedIdentity(request.authorization);
      const requestedVisitorId = typeof (request.data as any)?.visitorId === 'string' ? (request.data as any).visitorId : '';
      if (requestedVisitorId && guestIdentity.visitorId !== requestedVisitorId) unauthorized('游客身份无效', 'INVALID_VISITOR_SESSION');
      const session = await this.services.auth.loginWechatMini(request.data as any, request.openId);
      if (guestIdentity.visitorId) await this.mergeIdentity(guestIdentity.visitorId, session.accountId);
      return session;
    }
    if (request.method === 'POST' && path === '/v1/auth/wechat-phone') {
      if (!request.openId) unauthorized('仅允许微信小程序获取手机号', 'WECHAT_CONTEXT_REQUIRED');
      await this.enforceRateLimit(`wechat-phone:${request.openId}`, 10, 60 * 60_000);
      return this.services.auth.getWechatPhoneNumber(String((request.data as any)?.code ?? ''));
    }
    if (request.method === 'POST' && path === '/v1/auth/avatar') {
      if (!request.openId) unauthorized('仅允许微信小程序上传头像', 'WECHAT_CONTEXT_REQUIRED');
      await this.enforceRateLimit(`avatar:${request.openId}`, 10, 60 * 60_000);
      return this.services.auth.uploadAvatar(request.openId, String((request.data as any)?.contentBase64 ?? ''));
    }
    if (request.method === 'POST' && path === '/v1/auth/merge-visitor') {
      unauthorized('该接口已停用', 'ENDPOINT_DISABLED');
    }

    if (request.method === 'GET' && path === '/v1/catalog/home') return this.services.catalog.home();
    if (request.method === 'GET' && path === '/v1/catalog/categories') return (await this.services.catalog.home()).categories;
    if (request.method === 'GET' && path === '/v1/catalog/stores') return this.services.catalog.list(request.query.get('categoryId') ?? undefined);
    if (request.method === 'GET' && path === '/v1/catalog/search') return this.services.catalog.list(undefined, request.query.get('q') ?? '');
    if (request.method === 'GET' && segments[1] === 'catalog' && segments[2] === 'stores' && segments[3]) {
      return this.services.catalog.find(decodeURIComponent(segments[3]));
    }

    if (request.method === 'GET' && path === '/v1/map/reverse-geocode') {
      await this.enforceRateLimit(`map:${request.openId ?? request.ipAddress ?? 'unknown'}`, 120, 60 * 60_000);
      return this.services.map.reverseGeocode(Number(request.query.get('lat')), Number(request.query.get('lng')));
    }
    if (request.method === 'GET' && path === '/v1/map/nearby') {
      await this.enforceRateLimit(`map:${request.openId ?? request.ipAddress ?? 'unknown'}`, 120, 60 * 60_000);
      return this.services.map.nearbyPlaces(Number(request.query.get('lat')), Number(request.query.get('lng')));
    }
    if (request.method === 'GET' && path === '/v1/map/suggest') {
      await this.enforceRateLimit(`map:${request.openId ?? request.ipAddress ?? 'unknown'}`, 120, 60 * 60_000);
      return this.services.map.suggestPlaces(request.query.get('keyword') ?? '', request.query.get('region') ?? undefined);
    }

    if (request.method === 'GET' && path === '/v1/addresses/me') {
      return this.services.addresses.list(await this.services.auth.resolvePersistedIdentity(request.authorization, request.openId));
    }
    if (request.method === 'POST' && path === '/v1/addresses') {
      return this.services.addresses.save(request.data as any, await this.services.auth.resolvePersistedIdentity(request.authorization, request.openId));
    }
    if (request.method === 'POST' && segments[1] === 'addresses' && segments[3] === 'delete') {
      return this.services.addresses.remove(decodeURIComponent(segments[2]), await this.services.auth.resolvePersistedIdentity(request.authorization, request.openId));
    }

    if (request.method === 'POST' && path === '/v1/orders/quote') return this.services.orders.quote(request.data as any);
    if (request.method === 'POST' && path === '/v1/orders/virtual') {
      const identity = await this.services.auth.resolvePersistedIdentity(request.authorization, request.openId);
      if (!identity.accountId) unauthorized();
      return this.services.orders.create(request.data as any, identity.accountId);
    }
    if (request.method === 'GET' && path === '/v1/orders/me') {
      const identity = await this.services.auth.resolvePersistedIdentity(request.authorization, request.openId);
      return this.services.orders.list(identity.visitorId, identity.accountId);
    }
    if (request.method === 'GET' && segments[1] === 'orders' && segments[2]) {
      const identity = await this.services.auth.resolvePersistedIdentity(request.authorization, request.openId);
      return this.services.orders.find(decodeURIComponent(segments[2]), identity);
    }

    if (request.method === 'GET' && path === '/v1/accounts/me/savings') {
      const identity = await this.services.auth.resolvePersistedIdentity(request.authorization, request.openId);
      return this.services.orders.savings(identity.accountId);
    }
    if (request.method === 'GET' && path === '/v1/accounts/me/wallet') {
      const accountId = await this.requireAccount(request.authorization, request.openId);
      await this.services.orders.settleFailedOrders(accountId);
      return this.services.wallet.summary(accountId);
    }
    if (request.method === 'GET' && path === '/v1/accounts/me/wallet/transactions') {
      const accountId = await this.requireAccount(request.authorization, request.openId);
      await this.services.orders.settleFailedOrders(accountId);
      return this.services.wallet.listTransactions(accountId);
    }
    if (request.method === 'POST' && path === '/v1/accounts/me/check-in') return this.services.wallet.checkIn(await this.requireAccount(request.authorization, request.openId));
    if (request.method === 'POST' && path === '/v1/shares') return this.services.shares.create(await this.requireAccount(request.authorization, request.openId), request.data as any);
    if (request.method === 'GET' && segments[1] === 'shares' && segments[2]) return this.services.shares.landing(decodeURIComponent(segments[2]));
    if (request.method === 'POST' && segments[1] === 'shares' && segments[2] && segments[3] === 'initiated-reward') {
      return this.services.shares.rewardInitiatedShare(await this.requireAccount(request.authorization, request.openId), decodeURIComponent(segments[2]));
    }

    if (request.method === 'POST' && path === '/v1/analytics/events') {
      await this.enforceRateLimit(`analytics:${request.openId ?? request.ipAddress ?? 'unknown'}`, 120, 60 * 60_000);
      return this.services.analytics.record(request.data, request.authorization, request.openId);
    }

    badRequest('接口不存在', 'NOT_FOUND');
  }

  private async routeAdmin(request: RequestContext, segments: string[]): Promise<unknown> {
    if (request.method === 'POST' && segments.join('/') === 'auth/login') {
      const body = request.data as { username?: string; password?: string };
      await this.enforceRateLimit(`admin-login:${request.ipAddress ?? 'unknown'}:${body?.username?.trim().toLowerCase() ?? ''}`, 5, 15 * 60_000);
      const result = await this.admin.auth.login(body?.username ?? '', body?.password ?? '');
      await this.admin.audit.record(result.admin, { action: 'auth.login', resourceType: 'admin_user', resourceId: result.admin.id, ipAddress: request.ipAddress });
      return result;
    }

    if (request.method === 'GET' && segments.join('/') === 'auth/me') return this.admin.auth.resolveToken(request.authorization);
    if (request.method === 'POST' && segments.join('/') === 'auth/logout') {
      const actor = await this.admin.auth.resolveToken(request.authorization);
      await this.admin.audit.record(actor, { action: 'auth.logout', resourceType: 'admin_user', resourceId: actor.id, ipAddress: request.ipAddress });
      return this.admin.auth.logout(request.authorization);
    }

    if (request.method === 'GET' && segments[0] === 'dashboard') {
      await requireAdmin(this.admin, request.authorization, 'dashboard:read');
      return this.admin.query.dashboard();
    }
    if (segments[0] === 'stores') {
      if (request.method === 'GET' && !segments[1]) {
        await requireAdmin(this.admin, request.authorization, 'catalog:read');
        return this.admin.query.listStores(Object.fromEntries(request.query.entries()));
      }
      if (request.method === 'GET' && segments[1] && !segments[2]) {
        await requireAdmin(this.admin, request.authorization, 'catalog:read');
        return this.admin.query.store(decodeURIComponent(segments[1]));
      }
      if (request.method === 'POST' && !segments[1]) {
        const actor = await requireAdmin(this.admin, request.authorization, 'catalog:write');
        return this.admin.mutation.saveStore(undefined, request.data, actor, request.ipAddress);
      }
      if (request.method === 'PATCH' && segments[1] && !segments[2]) {
        const actor = await requireAdmin(this.admin, request.authorization, 'catalog:write');
        return this.admin.mutation.saveStore(decodeURIComponent(segments[1]), request.data, actor, request.ipAddress);
      }
      if (segments[2] === 'menu-items') {
        const storeId = decodeURIComponent(segments[1]);
        if (request.method === 'GET' && !segments[3]) {
          await requireAdmin(this.admin, request.authorization, 'catalog:read');
          return this.admin.query.listMenuItems(storeId, Object.fromEntries(request.query.entries()));
        }
        if (request.method === 'POST' && !segments[3]) {
          const actor = await requireAdmin(this.admin, request.authorization, 'catalog:write');
          return this.admin.mutation.saveMenuItem(storeId, undefined, request.data, actor, request.ipAddress);
        }
        if (request.method === 'PATCH' && segments[3]) {
          const actor = await requireAdmin(this.admin, request.authorization, 'catalog:write');
          return this.admin.mutation.saveMenuItem(storeId, decodeURIComponent(segments[3]), request.data, actor, request.ipAddress);
        }
        if (request.method === 'POST' && segments[3] && segments[4] === 'transfer') {
          const actor = await requireAdmin(this.admin, request.authorization, 'catalog:write');
          return this.admin.mutation.transferMenuItem(storeId, decodeURIComponent(segments[3]), request.data, actor, request.ipAddress);
        }
      }
    }

    if (segments[0] === 'accounts') {
      if (request.method === 'GET' && !segments[1]) {
        await requireAdmin(this.admin, request.authorization, 'accounts:read');
        return this.admin.query.listAccounts(Object.fromEntries(request.query.entries()));
      }
      if (request.method === 'GET' && segments[1] && segments[2] === 'wallet') {
        await requireAdmin(this.admin, request.authorization, 'wallet:read');
        return this.admin.query.wallet(decodeURIComponent(segments[1]), Object.fromEntries(request.query.entries()));
      }
      if (request.method === 'POST' && segments[1] && segments[2] === 'wallet' && segments[3] === 'adjustments') {
        const actor = await requireAdmin(this.admin, request.authorization, 'wallet:adjust');
        return this.admin.mutation.adjustWallet(decodeURIComponent(segments[1]), request.data, actor, request.ipAddress);
      }
      if (request.method === 'GET' && segments[1]) {
        await requireAdmin(this.admin, request.authorization, 'accounts:read');
        return this.admin.query.account(decodeURIComponent(segments[1]));
      }
      if (request.method === 'PATCH' && segments[1]) {
        const actor = await requireAdmin(this.admin, request.authorization, 'accounts:write');
        return this.admin.mutation.updateAccount(decodeURIComponent(segments[1]), request.data, actor, request.ipAddress);
      }
    }

    if (segments[0] === 'orders') {
      if (request.method === 'GET' && !segments[1]) {
        await requireAdmin(this.admin, request.authorization, 'orders:read');
        return this.admin.query.listOrders(Object.fromEntries(request.query.entries()));
      }
      if (request.method === 'GET' && segments[1]) {
        await requireAdmin(this.admin, request.authorization, 'orders:read');
        return this.admin.query.order(decodeURIComponent(segments[1]));
      }
      if (request.method === 'PATCH' && segments[1]) {
        const actor = await requireAdmin(this.admin, request.authorization, 'orders:write');
        return this.admin.mutation.updateOrder(decodeURIComponent(segments[1]), request.data, actor, request.ipAddress);
      }
    }

    if (segments[0] === 'admin-users') {
      if (request.method === 'GET') {
        await requireAdmin(this.admin, request.authorization, 'admins:manage');
        return this.admin.query.listAdminUsers(Object.fromEntries(request.query.entries()));
      }
      if (request.method === 'POST' && !segments[1]) {
        const actor = await requireAdmin(this.admin, request.authorization, 'admins:manage');
        return this.admin.mutation.createAdmin(request.data, actor, request.ipAddress);
      }
      if (request.method === 'PATCH' && segments[1]) {
        const actor = await requireAdmin(this.admin, request.authorization, 'admins:manage');
        return this.admin.mutation.updateAdmin(decodeURIComponent(segments[1]), request.data, actor, request.ipAddress);
      }
      if (request.method === 'POST' && segments[1] && segments[2] === 'reset-password') {
        const actor = await requireAdmin(this.admin, request.authorization, 'admins:manage');
        return this.admin.mutation.resetAdminPassword(decodeURIComponent(segments[1]), request.data, actor, request.ipAddress);
      }
    }

    if (request.method === 'GET' && segments[0] === 'audit-logs') {
      await requireAdmin(this.admin, request.authorization, 'audit:read');
      return this.admin.query.listAuditLogs(Object.fromEntries(request.query.entries()));
    }
    if (segments.join('/') === 'share-rewards/config') {
      if (request.method === 'GET') {
        await requireAdmin(this.admin, request.authorization, 'wallet:read');
        return this.services.shares.config();
      }
      if (request.method === 'PATCH') {
        const actor = await requireAdmin(this.admin, request.authorization, 'wallet:adjust');
        const before = await this.services.shares.config();
        const after = await this.services.shares.updateConfig(request.data);
        await this.admin.audit.record(actor, { action: 'share_reward_config.update', resourceType: 'share_reward_config', resourceId: 'default', beforeData: before, afterData: after, ipAddress: request.ipAddress });
        return after;
      }
    }

    badRequest('后台接口不存在', 'NOT_FOUND');
  }

  private async requireAccount(authorization?: string, openId?: string): Promise<string> {
    const identity = await this.services.auth.resolvePersistedIdentity(authorization, openId);
    if (!identity.accountId) unauthorized();
    return identity.accountId;
  }

  private enforceRateLimit(key: string, limit: number, windowMs: number): Promise<void> {
    return this.rateLimits.consume(key, limit, windowMs);
  }

  private requireAllowedAdminOrigin(origin?: string): void {
    const configured = (process.env.ADMIN_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!configured.length || !origin || !configured.includes(origin)) forbidden('后台来源不受信任', 'ADMIN_ORIGIN_FORBIDDEN');
  }

  private async mergeIdentity(visitorId: string, accountId: string) {
    return this.db.transaction(async (tx) => {
      await this.services.auth.linkVisitorToAccount(visitorId, accountId, tx);
      const orders = await this.services.orders.merge(visitorId, accountId, tx);
      const addresses = await this.services.addresses.merge(visitorId, accountId, tx);
      return { merged: orders.merged + addresses.merged };
    });
  }
}

function normalizeRequest(event: CloudFunctionEvent, rawContext?: any): RequestContext {
  const body = parseGatewayBody(event);
  const method = (body.method ?? event.method ?? (event as any).httpMethod ?? 'GET').toUpperCase() as RequestContext['method'];
  const path = normalizePath(body.path ?? event.path ?? (event as any).path ?? '/v1/health');
  const query = new URLSearchParams();
  const [, queryString] = path.split('?');
  if (queryString) new URLSearchParams(queryString).forEach((value, key) => query.set(key, value));
  if (body.query) {
    for (const [key, value] of Object.entries(body.query)) {
      if (value !== undefined) query.set(key, String(value));
    }
  }
  for (const [key, value] of Object.entries(event.query ?? {})) {
    if (value !== undefined) query.set(key, String(value));
  }
  return {
    method,
    path: path.split('?')[0],
    query,
    data: body.data ?? event.data,
    authorization: body.authorization ?? event.authorization ?? event.headers?.authorization ?? event.headers?.Authorization,
    openId: typeof rawContext?.OPENID === 'string' && rawContext.OPENID ? rawContext.OPENID : undefined,
    ipAddress: event.headers?.['x-forwarded-for'] ?? event.headers?.['x-real-ip'],
    origin: event.headers?.origin ?? event.headers?.Origin,
  };
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function parseGatewayBody(event: CloudFunctionEvent): Partial<CloudFunctionEvent> {
  const raw = (event as any).body;
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Partial<CloudFunctionEvent>;
  if (typeof raw !== 'string') return {};
  if (Buffer.byteLength(raw, 'utf8') > 65_536) badRequest('请求数据过大', 'PAYLOAD_TOO_LARGE');
  try {
    return JSON.parse(raw) as Partial<CloudFunctionEvent>;
  } catch {
    return {};
  }
}
