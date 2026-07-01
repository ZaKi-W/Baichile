import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AccountSession, GuestSession, WechatMiniLoginRequest } from '@baichile/api-contract';

interface WechatCodeSession {
  openid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly request: typeof fetch = fetch) {}

  createGuest(): GuestSession {
    const id = randomUUID();
    return {
      visitorId: `visitor_${id}`,
      accessToken: `guest.${id}`,
      refreshToken: `refresh.${randomUUID()}`,
    };
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
      return {
        accountId: `account_${id}`,
        accessToken: `account.${id}`,
        provider: 'dev-mock',
        profile,
      };
    }

    const query = new URLSearchParams({
      appid: appId,
      secret: appSecret,
      js_code: input.code,
      grant_type: 'authorization_code',
    });
    const response = await this.request(`https://api.weixin.qq.com/sns/jscode2session?${query}`);
    const session = await response.json() as WechatCodeSession;
    if (!response.ok || !session.openid || session.errcode) {
      throw new BadRequestException('微信登录凭证无效');
    }

    const digest = createHash('sha256').update(session.openid).digest('hex');
    return {
      accountId: `account_${digest.slice(0, 24)}`,
      accessToken: `account.${digest}`,
      provider: 'wechat',
      profile,
    };
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
