import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type {
  AccountSession,
  GuestSession,
  WechatMiniLoginRequest,
  WechatPhoneResult,
} from '@baichile/api-contract';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AccountEntity } from './database/entities/account.entity';
import { VisitorSessionEntity } from './database/entities/visitor-session.entity';
import { WalletService } from './wallet.service';
import { ShareService } from './share/share.service';

interface WechatCodeSession {
  openid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

interface WechatAccessTokenResponse {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
}

interface WechatPhoneResponse {
  errcode?: number;
  errmsg?: string;
  phone_info?: WechatPhoneResult;
}

@Injectable()
export class AuthService {
  private wechatAccessToken = '';
  private wechatAccessTokenExpiresAt = 0;

  constructor(
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(VisitorSessionEntity) private readonly visitors: Repository<VisitorSessionEntity>,
    @Inject(WalletService) private readonly wallet: WalletService,
    @Inject(ShareService) private readonly shares: ShareService,
  ) {}

  resolveIdentity(authorization?: string): { visitorId?: string; accountId?: string } {
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return {};
    if (token.startsWith('guest.')) {
      return { visitorId: `visitor_${token.slice('guest.'.length)}` };
    }
    if (token.startsWith('account.')) {
      const subject = token.slice('account.'.length);
      return { accountId: `account_${/^[a-f0-9]{64}$/i.test(subject) ? subject.slice(0, 24) : subject}` };
    }
    return {};
  }

  async resolvePersistedIdentity(authorization?: string): Promise<{ visitorId?: string; accountId?: string }> {
    const identity = this.resolveIdentity(authorization);
    if (identity.accountId) {
      const account = await this.accounts.findOneBy({ id: identity.accountId });
      if (account?.status === 'disabled') {
        throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: '账号已被禁用' });
      }
      if (!account) {
        await this.accounts.manager.transaction(async (manager) => {
          await manager.getRepository(AccountEntity).insert({
            id: identity.accountId!,
            wechatOpenIdHash: null,
            nickname: null,
            avatarUrl: null,
            balanceCents: 0,
          });
          await this.wallet.initializeAccount(identity.accountId!, manager);
        });
      }
    }
    return identity;
  }

  async createGuest(): Promise<GuestSession> {
    const id = randomUUID();
    const session = {
      visitorId: `visitor_${id}`,
      accessToken: `guest.${id}`,
      refreshToken: `refresh.${randomUUID()}`,
    };
    await this.visitors.save(this.visitors.create({ visitorId: session.visitorId, accountId: null }));
    return session;
  }

  mockWechat(visitorId?: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('生产环境必须配置真实微信登录');
    }
    return { accountId: `account_${randomUUID()}`, visitorId, provider: 'dev-mock' };
  }

  async loginWechatMini(input: WechatMiniLoginRequest): Promise<AccountSession> {
    const profile = this.validateProfile(input);
    const appId = process.env.WECHAT_MINI_APP_ID;
    const appSecret = process.env.WECHAT_MINI_APP_SECRET;

    if (!appId || !appSecret) {
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException('微信登录配置缺失');
      }
      const id = randomUUID();
      const session: AccountSession = {
        accountId: `account_${id}`,
        accessToken: `account.${id}`,
        provider: 'dev-mock',
        profile,
      };
      await this.accounts.manager.transaction(async (manager) => {
        await manager.save(manager.getRepository(AccountEntity).create({
          id: session.accountId, wechatOpenIdHash: null, nickname: profile.nickname,
          avatarUrl: profile.avatarUrl, balanceCents: 0,
        }));
        await this.wallet.initializeAccount(session.accountId, manager);
      });
      await this.shares.completeReferral(session.accountId, input.referralToken);
      return session;
    }

    const query = new URLSearchParams({
      appid: appId,
      secret: appSecret,
      js_code: input.code,
      grant_type: 'authorization_code',
    });
    const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${query}`);
    const session = await response.json() as WechatCodeSession;
    if (!response.ok || !session.openid || session.errcode) {
      throw new BadRequestException('微信登录凭证无效');
    }

    const digest = createHash('sha256').update(session.openid).digest('hex');
    const existing = await this.accounts.findOneBy({ wechatOpenIdHash: digest });
    const accountId = existing?.id ?? `account_${digest.slice(0, 24)}`;
    await this.accounts.manager.transaction(async (manager) => {
      await manager.save(manager.getRepository(AccountEntity).create({
        ...existing, id: accountId, wechatOpenIdHash: digest, nickname: profile.nickname,
        avatarUrl: profile.avatarUrl, balanceCents: existing?.balanceCents ?? 0,
      }));
      await this.wallet.initializeAccount(accountId, manager);
    });
    if (!existing) await this.shares.completeReferral(accountId, input.referralToken);
    return {
      accountId,
      accessToken: `account.${digest}`,
      provider: 'wechat',
      profile,
    };
  }

  async getWechatPhoneNumber(code: string): Promise<WechatPhoneResult> {
    if (!code?.trim()) throw new BadRequestException('手机号授权凭证不能为空');
    const accessToken = await this.getWechatAccessToken();
    const response = await fetch(
      `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      },
    );
    const body = await response.json() as WechatPhoneResponse;
    if (!response.ok || body.errcode || !body.phone_info?.phoneNumber) {
      throw new BadRequestException('微信手机号授权已失效，请重试');
    }
    return body.phone_info;
  }

  async linkVisitorToAccount(visitorId: string, accountId: string, manager?: EntityManager) {
    const repo = (manager ?? this.visitors.manager).getRepository(VisitorSessionEntity);
    await repo.update({ visitorId }, { accountId });
  }

  private validateProfile(input: WechatMiniLoginRequest) {
    const avatarUrl = input.profile?.avatarUrl?.trim();
    const nickname = input.profile?.nickname?.trim();
    if (!input.code?.trim() || !avatarUrl || !nickname || nickname.length > 32) {
      throw new BadRequestException('登录资料不完整');
    }
    return { avatarUrl, nickname };
  }

  private async getWechatAccessToken(): Promise<string> {
    if (this.wechatAccessToken && Date.now() < this.wechatAccessTokenExpiresAt) {
      return this.wechatAccessToken;
    }
    const appId = process.env.WECHAT_MINI_APP_ID;
    const appSecret = process.env.WECHAT_MINI_APP_SECRET;
    if (!appId || !appSecret) throw new ServiceUnavailableException('微信手机号能力配置缺失');

    const response = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credential',
        appid: appId,
        secret: appSecret,
        force_refresh: false,
      }),
    });
    const body = await response.json() as WechatAccessTokenResponse;
    if (!response.ok || body.errcode || !body.access_token) {
      throw new ServiceUnavailableException('微信手机号服务暂不可用');
    }
    this.wechatAccessToken = body.access_token;
    this.wechatAccessTokenExpiresAt = Date.now() + Math.max(60, (body.expires_in ?? 7200) - 300) * 1000;
    return this.wechatAccessToken;
  }
}
