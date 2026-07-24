import { defineStore } from 'pinia';
import type {
  AccountSession,
  UserProfile,
  WechatMiniLoginRequest,
  WechatPhoneBindResult,
} from '@baichile/api-contract';
import { requestApi } from '../services/http';

const VISITOR_KEY = 'baichile:visitor';
const ACCOUNT_KEY = 'baichile:account';
const EMPTY_PROFILE: UserProfile = { avatarUrl: '', nickname: '' };
const REFERRAL_KEY = 'baichile:referral-token';
const WECHAT_BINDING_KEY = 'baichile:wechat-native-bound:v2';
export const DEFAULT_ACCOUNT_AVATAR = '/static/tabbar/profile.svg';
export type LoginContinuation =
  | ''
  | 'wallet'
  | 'check-in'
  | 'share-achievement'
  | 'share-reward'
  | `share-order:${string}`
  | `share-egg:${string}`;
let guestInitialization: Promise<void> | undefined;

function errorMessage(value: unknown, fallback: string): string {
  if (value instanceof Error) return value.message || fallback;
  if (value && typeof value === 'object') {
    if ('message' in value && typeof value.message === 'string') return value.message;
    if ('errMsg' in value && typeof value.errMsg === 'string') return value.errMsg;
  }
  return fallback;
}

function readFileAsBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx?.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (result) => typeof result.data === 'string' ? resolve(result.data) : reject(new Error('头像数据格式不正确')),
      fail: reject,
    });
  });
}

function compressImage(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx?.compressImage({
      src: filePath,
      quality: 80,
      success: (result) => resolve(result.tempFilePath),
      fail: reject,
    });
  });
}

export async function prepareWechatAvatar(filePath: string): Promise<{ filePath: string; contentBase64: string }> {
  if (typeof wx === 'undefined') throw new Error('微信运行环境未初始化');
  try {
    return { filePath, contentBase64: await readFileAsBase64(filePath) };
  } catch (readError) {
    try {
      const compressedPath = await compressImage(filePath);
      return { filePath: compressedPath, contentBase64: await readFileAsBase64(compressedPath) };
    } catch (fallbackError) {
      console.warn('[auth] WeChat avatar file could not be read', { readError, fallbackError });
      throw new Error('头像读取失败，请重新选取头像');
    }
  }
}

async function uploadWechatAvatarFile(filePath: string, visitorId: string): Promise<string> {
  const cloud = typeof wx === 'undefined' ? undefined : wx.cloud;
  if (!cloud) throw new Error('云开发环境未初始化');
  const extension = filePath.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1]?.toLowerCase() || 'jpg';
  const safeExtension = ['jpg', 'jpeg', 'png', 'webp'].includes(extension) ? extension : 'jpg';
  const result = await cloud.uploadFile({
    cloudPath: `avatars/${visitorId || 'wechat'}/${Date.now()}.${safeExtension}`,
    filePath,
  });
  if (!result.fileID) throw new Error('头像上传失败');
  return result.fileID;
}

async function persistWechatAvatar(filePath: string, accessToken: string, visitorId: string): Promise<string> {
  if (!filePath || /^(cloud:\/\/|https:\/\/)/.test(filePath)) return filePath;
  let contentBase64: string;
  try {
    contentBase64 = (await prepareWechatAvatar(filePath)).contentBase64;
  } catch (readError) {
    console.warn('[auth] Falling back to direct avatar upload', readError);
    return uploadWechatAvatarFile(filePath, visitorId);
  }
  if (contentBase64.length > Math.ceil(2 * 1024 * 1024 * 4 / 3) + 8) {
    throw new Error('头像文件过大，请重新选择');
  }
  const result = await requestApi<{ fileID: string }>('POST', '/v1/auth/avatar', accessToken, { contentBase64 });
  return result.fileID;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    visitorId: '' as string,
    accessToken: '' as string,
    accountId: '' as string,
    provider: 'guest' as 'guest' | AccountSession['provider'],
    userProfile: { ...EMPTY_PROFILE } as UserProfile,
    loginRequested: false,
    loginContinuation: '' as LoginContinuation,
  }),
  actions: {
    async ensureGuest() {
      if (!guestInitialization) {
        guestInitialization = this.initializeGuest().finally(() => {
          guestInitialization = undefined;
        });
      }
      return guestInitialization;
    },
    async initializeGuest() {
      const account = uni.getStorageSync(ACCOUNT_KEY) as AccountSession | '';
      const saved = uni.getStorageSync(VISITOR_KEY) as { visitorId: string; accessToken: string } | '';
      if (saved) {
        this.visitorId = saved.visitorId;
        this.accessToken = saved.accessToken;
      } else {
        const data = await requestApi<{ visitorId: string; accessToken: string }>('POST', '/v1/auth/guest', '');
        this.visitorId = data.visitorId;
        this.accessToken = data.accessToken;
        uni.setStorageSync(VISITOR_KEY, { visitorId: this.visitorId, accessToken: this.accessToken });
      }
      if (isWebPlatform()) {
        await this.restoreWebPhoneSession();
        return;
      }
      if (account) {
        this.applyAccount(account);
        await this.ensureWechatBinding(account);
      }
    },
    async wechatLogin(profile: UserProfile) {
      const persistedAvatarUrl = await persistWechatAvatar(profile.avatarUrl.trim(), this.accessToken, this.visitorId);
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
          avatarUrl: persistedAvatarUrl,
          nickname: profile.nickname.trim(),
        },
        referralToken: uni.getStorageSync(REFERRAL_KEY) || undefined,
      };
      const session = await requestApi<AccountSession>('POST', '/v1/auth/wechat-mini', this.accessToken, payload)
        .catch((error) => {
          throw new Error(errorMessage(error, '微信登录失败'));
        });
      this.applyAccount(session);
      this.persistAccount();
      uni.setStorageSync(WECHAT_BINDING_KEY, true);
      uni.removeStorageSync(REFERRAL_KEY);
    },
    async restoreWebPhoneSession() {
      // #ifdef H5
      const { hasWebPhoneSession } = await import('../platform/cloudbase-web');
      if (!await hasWebPhoneSession()) {
        this.clearAccount();
        return false;
      }
      const session = await requestApi<AccountSession>(
        'POST',
        '/v1/auth/web-phone/session',
        this.guestAccessToken(),
      );
      this.applyAccount(session);
      this.persistAccount();
      return true;
      // #endif
      this.clearAccount();
      return false;
    },
    async createWebPhoneSession(phoneNumber?: string) {
      const session = await requestApi<AccountSession>(
        'POST',
        '/v1/auth/web-phone/session',
        this.guestAccessToken(),
        phoneNumber ? { phoneNumber } : undefined,
      );
      this.applyAccount(session);
      this.persistAccount();
      return session;
    },
    async logoutWebPhone() {
      // #ifdef H5
      const { signOutWebPhone } = await import('../platform/cloudbase-web');
      await signOutWebPhone();
      this.clearAccount();
      return;
      // #endif
      this.clearAccount();
    },
    async bindWechatPhone(code: string): Promise<WechatPhoneBindResult> {
      const result = await requestApi<WechatPhoneBindResult>(
        'POST',
        '/v1/auth/wechat-phone-bind',
        this.accessToken,
        { code },
      );
      this.applyAccount(result.session);
      this.persistAccount();
      return result;
    },
    async ensureWechatBinding(account: AccountSession) {
      if (account.provider !== 'wechat' || uni.getStorageSync(WECHAT_BINDING_KEY)) return;
      try {
        await this.wechatLogin(account.profile);
      } catch (error) {
        console.warn('[auth] Failed to restore native WeChat account binding', error);
      }
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
      this.accessToken = session.accessToken || '';
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
    guestAccessToken() {
      const saved = uni.getStorageSync(VISITOR_KEY) as { visitorId?: string; accessToken?: string } | '';
      return saved && typeof saved.accessToken === 'string' ? saved.accessToken : '';
    },
    clearAccount() {
      this.accountId = '';
      this.provider = 'guest';
      this.userProfile = { ...EMPTY_PROFILE };
      this.accessToken = this.guestAccessToken();
      uni.removeStorageSync(ACCOUNT_KEY);
    },
    requestLogin(continuation: LoginContinuation = '') {
      this.loginRequested = true;
      this.loginContinuation = continuation;
    },
    consumeLoginRequest() {
      const requested = this.loginRequested;
      this.loginRequested = false;
      return requested;
    },
    consumeLoginContinuation(): LoginContinuation {
      const continuation = this.loginContinuation;
      this.loginContinuation = '';
      return continuation;
    },
  },
});

export function isWebPlatform(): boolean {
  return typeof window !== 'undefined' && (typeof wx === 'undefined' || !wx.cloud);
}
