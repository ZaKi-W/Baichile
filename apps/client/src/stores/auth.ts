import { defineStore } from 'pinia';
import type { AccountSession, UserProfile, WechatMiniLoginRequest } from '@baichile/api-contract';
import { API_BASE } from '../config/api';

const VISITOR_KEY = 'baichile:visitor';
const ACCOUNT_KEY = 'baichile:account';
const EMPTY_PROFILE: UserProfile = { avatarUrl: '', nickname: '' };
const REFERRAL_KEY = 'baichile:referral-token';

function errorMessage(value: unknown, fallback: string): string {
  if (value instanceof Error) return value.message || fallback;
  if (value && typeof value === 'object') {
    if ('message' in value && typeof value.message === 'string') return value.message;
    if ('errMsg' in value && typeof value.errMsg === 'string') return value.errMsg;
  }
  return fallback;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    visitorId: '' as string,
    accessToken: '' as string,
    accountId: '' as string,
    provider: 'guest' as 'guest' | 'dev-mock' | 'wechat',
    userProfile: { ...EMPTY_PROFILE } as UserProfile,
    loginRequested: false,
  }),
  actions: {
    async ensureGuest() {
      const account = uni.getStorageSync(ACCOUNT_KEY) as AccountSession | '';
      if (account) this.applyAccount(account);
      const saved = uni.getStorageSync(VISITOR_KEY) as { visitorId: string; accessToken: string } | '';
      if (saved) {
        this.visitorId = saved.visitorId;
        if (!account) this.accessToken = saved.accessToken;
        return;
      }
      if (API_BASE) {
        try {
          const data = await new Promise<{ visitorId: string; accessToken: string }>((resolve, reject) => {
            uni.request({
              method: 'POST', url: `${API_BASE}/v1/auth/guest`,
              success: (response) => resolve(response.data as { visitorId: string; accessToken: string }),
              fail: reject,
            });
          });
          this.visitorId = data.visitorId;
          this.accessToken = data.accessToken;
        } catch {
          this.createLocalGuest();
        }
      } else {
        this.createLocalGuest();
      }
      const guestAccessToken = this.accessToken;
      uni.setStorageSync(VISITOR_KEY, { visitorId: this.visitorId, accessToken: guestAccessToken });
      if (account) this.applyAccount(account);
    },
    createLocalGuest() {
      this.visitorId = `visitor_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      this.accessToken = `local.${this.visitorId}`;
    },
    async wechatLogin(profile: UserProfile) {
      const code = await new Promise<string>((resolve, reject) => {
        uni.login({
          provider: 'weixin',
          success: (result) => result.code ? resolve(result.code) : reject(new Error('未获取到微信登录凭证')),
          fail: reject,
        });
      });
      const payload: WechatMiniLoginRequest = {
        code,
        visitorId: this.visitorId || undefined,
        profile: {
          avatarUrl: profile.avatarUrl.trim(),
          nickname: profile.nickname.trim(),
        },
        referralToken: uni.getStorageSync(REFERRAL_KEY) || undefined,
      };
      const session = await new Promise<AccountSession>((resolve, reject) => {
        uni.request({
          method: 'POST',
          url: `${API_BASE}/v1/auth/wechat-mini`,
          data: payload,
          success: (response) => {
            if (response.statusCode && response.statusCode >= 400) {
              reject(new Error(errorMessage(response.data, '微信登录失败')));
              return;
            }
            resolve(response.data as AccountSession);
          },
          fail: (error) => reject(new Error(errorMessage(error, '网络连接失败'))),
        });
      });
      this.applyAccount(session);
      this.persistAccount();
      uni.removeStorageSync(REFERRAL_KEY);
    },
    rememberReferral(token: string) {
      if (token && !this.accountId) uni.setStorageSync(REFERRAL_KEY, token);
    },
    setUserProfile(profile: UserProfile) {
      this.userProfile = {
        avatarUrl: profile.avatarUrl.trim(),
        nickname: profile.nickname.trim(),
      };
      if (this.accountId) this.persistAccount();
    },
    applyAccount(session: AccountSession) {
      this.accountId = session.accountId;
      this.accessToken = session.accessToken;
      this.provider = session.provider;
      this.userProfile = { ...session.profile };
    },
    persistAccount() {
      if (this.provider === 'guest') return;
      uni.setStorageSync(ACCOUNT_KEY, {
        accountId: this.accountId,
        accessToken: this.accessToken,
        provider: this.provider,
        profile: this.userProfile,
      } satisfies AccountSession);
    },
    requestLogin() {
      this.loginRequested = true;
    },
    consumeLoginRequest() {
      const requested = this.loginRequested;
      this.loginRequested = false;
      return requested;
    },
    async devLogin() {
      if (import.meta.env.PROD) throw new Error('生产环境不可使用模拟微信登录');
      this.accountId = `account_dev_${Date.now()}`;
      this.provider = 'dev-mock';
      if (API_BASE) {
        await uni.request({
          method: 'POST',
          url: `${API_BASE}/v1/auth/merge-visitor`,
          data: { visitorId: this.visitorId, accountId: this.accountId },
        });
      }
    },
  },
});
