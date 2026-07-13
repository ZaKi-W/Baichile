import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { prepareWechatAvatar, useAuthStore } from './auth';

describe('auth store WeChat login', () => {
  const storage = new Map<string, unknown>();

  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
    vi.stubGlobal('uni', {
      getStorageSync: vi.fn((key: string) => storage.get(key) ?? ''),
      setStorageSync: vi.fn((key: string, value: unknown) => storage.set(key, value)),
      removeStorageSync: vi.fn((key: string) => storage.delete(key)),
      login: vi.fn(({ success }: { success: (result: { code: string }) => void }) => {
        success({ code: 'wx-login-code' });
      }),
    });
    vi.stubGlobal('wx', {
      cloud: {
        uploadFile: vi.fn().mockResolvedValue({ fileID: 'cloud://avatar.png' }),
        callFunction: vi.fn(({ name, data }: {
          name: string;
          data: {
            method: string;
            path: string;
            data: unknown;
            authorization: string;
          };
        }) => {
          expect(name).toBe('api');
          expect(data).toEqual({
            method: 'POST',
            path: '/v1/auth/wechat-mini',
            data: {
              code: 'wx-login-code',
              visitorId: 'visitor_existing',
              profile: {
                avatarUrl: 'https://example.com/avatar.png',
                nickname: '小白',
              },
              referralToken: undefined,
            },
            authorization: '',
          });
          return Promise.resolve({
            result: {
              ok: true,
              data: {
                accountId: 'account_wechat',
                accessToken: 'account.token',
                provider: 'wechat',
                profile: {
                  avatarUrl: 'https://example.com/avatar.png',
                  nickname: '小白',
                },
              },
            },
          });
        }),
      },
    });
  });

  it('logs in with a WeChat code and persists the account session', async () => {
    const auth = useAuthStore();
    auth.visitorId = 'visitor_existing';

    await auth.wechatLogin({
      avatarUrl: 'https://example.com/avatar.png',
      nickname: '小白',
    });

    expect(auth.accountId).toBe('account_wechat');
    expect(auth.provider).toBe('wechat');
    expect(auth.userProfile.nickname).toBe('小白');
    expect(storage.get('baichile:account')).toMatchObject({
      accountId: 'account_wechat',
      accessToken: 'account.token',
      provider: 'wechat',
    });
    expect(storage.get('baichile:wechat-native-bound:v2')).toBe(true);
  });

  it('silently rebinds a restored legacy WeChat session once', async () => {
    storage.set('baichile:visitor', { visitorId: 'visitor_existing', accessToken: 'guest.token' });
    storage.set('baichile:account', {
      accountId: 'account_wechat',
      accessToken: '',
      provider: 'wechat',
      profile: { avatarUrl: 'https://example.com/avatar.png', nickname: '小白' },
    });
    const auth = useAuthStore();

    await Promise.all([auth.ensureGuest(), auth.ensureGuest()]);

    expect(auth.accountId).toBe('account_wechat');
    expect(storage.get('baichile:wechat-native-bound:v2')).toBe(true);
    expect(uni.login).toHaveBeenCalledTimes(1);
  });

  it('keeps the guest identity when WeChat login fails', async () => {
    vi.mocked(uni.login).mockImplementation((options) => {
      const { fail } = options as NonNullable<typeof options> & {
        fail?: (error: { errMsg: string }) => void;
      };
      fail?.({ errMsg: 'login:fail' });
      return undefined as never;
    });
    const auth = useAuthStore();
    auth.visitorId = 'visitor_existing';
    auth.accessToken = 'guest.token';

    await expect(auth.wechatLogin({
      avatarUrl: 'https://example.com/avatar.png',
      nickname: '小白',
    })).rejects.toBeTruthy();

    expect(auth.visitorId).toBe('visitor_existing');
    expect(auth.accessToken).toBe('guest.token');
    expect(auth.accountId).toBe('');
  });

  it('surfaces the API error message when WeChat rejects login', async () => {
    const cloud = wx?.cloud;
    if (!cloud) throw new Error('wx.cloud not stubbed');
    vi.mocked(cloud.callFunction).mockResolvedValue({
      result: { ok: false, status: 400, message: '微信登录凭证无效' },
    });
    const auth = useAuthStore();

    await expect(auth.wechatLogin({
      avatarUrl: 'https://example.com/avatar.png',
      nickname: '小白',
    })).rejects.toThrow('微信登录凭证无效');
  });

  it('recreates an unreadable selected avatar before reading it', async () => {
    const readFile = vi.fn()
      .mockImplementationOnce(({ fail }) => fail({ errMsg: 'readFile:fail no such file' }))
      .mockImplementationOnce(({ success }) => success({ data: 'base64-avatar' }));
    vi.stubGlobal('wx', {
      getFileSystemManager: () => ({ readFile }),
      compressImage: vi.fn(({ success }) => success({ tempFilePath: 'wxfile://readable-avatar.jpg' })),
    });

    await expect(prepareWechatAvatar('http://tmp/avatar.jpg')).resolves.toEqual({
      filePath: 'wxfile://readable-avatar.jpg',
      contentBase64: 'base64-avatar',
    });
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it('falls back to direct cloud upload when the selected avatar cannot be read', async () => {
    const uploadFile = vi.fn().mockResolvedValue({ fileID: 'cloud://fallback-avatar.jpg' });
    const callFunction = vi.fn().mockResolvedValue({
      result: {
        ok: true,
        data: {
          accountId: 'account_wechat',
          accessToken: 'account.token',
          provider: 'wechat',
          profile: { avatarUrl: 'cloud://fallback-avatar.jpg', nickname: '小白' },
        },
      },
    });
    vi.stubGlobal('wx', {
      cloud: { uploadFile, callFunction },
      getFileSystemManager: () => ({ readFile: vi.fn(({ fail }) => fail({ errMsg: 'readFile:fail' })) }),
      compressImage: vi.fn(({ fail }) => fail({ errMsg: 'compressImage:fail' })),
    });
    const auth = useAuthStore();
    auth.visitorId = 'visitor_existing';

    await auth.wechatLogin({ avatarUrl: 'http://tmp/avatar.jpg', nickname: '小白' });

    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({ filePath: 'http://tmp/avatar.jpg' }));
    expect(callFunction).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        path: '/v1/auth/wechat-mini',
        data: expect.objectContaining({
          profile: { avatarUrl: 'cloud://fallback-avatar.jpg', nickname: '小白' },
        }),
      }),
    }));
  });
});
