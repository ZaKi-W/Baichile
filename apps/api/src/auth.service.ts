import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AccountSession, GuestSession, WechatMiniLoginRequest } from '@baichile/api-contract';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AccountEntity } from './database/entities/account.entity';
import { VisitorSessionEntity } from './database/entities/visitor-session.entity';
import { WalletService } from './wallet.service';

interface WechatCodeSession {
  openid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(VisitorSessionEntity) private readonly visitors: Repository<VisitorSessionEntity>,
    @Inject(WalletService) private readonly wallet: WalletService,
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
    return {
      accountId,
      accessToken: `account.${digest}`,
      provider: 'wechat',
      profile,
    };
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
}
