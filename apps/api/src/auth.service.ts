import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { GuestSession } from '@baichile/api-contract';

@Injectable()
export class AuthService {
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
}

