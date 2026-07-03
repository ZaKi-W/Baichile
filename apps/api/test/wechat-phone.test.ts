import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth.service';

describe('WeChat phone-number exchange', () => {
  const previousAppId = process.env.WECHAT_MINI_APP_ID;
  const previousSecret = process.env.WECHAT_MINI_APP_SECRET;

  beforeEach(() => {
    process.env.WECHAT_MINI_APP_ID = 'wx-test-app';
    process.env.WECHAT_MINI_APP_SECRET = 'wx-test-secret';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousAppId === undefined) delete process.env.WECHAT_MINI_APP_ID;
    else process.env.WECHAT_MINI_APP_ID = previousAppId;
    if (previousSecret === undefined) delete process.env.WECHAT_MINI_APP_SECRET;
    else process.env.WECHAT_MINI_APP_SECRET = previousSecret;
  });

  it('exchanges a one-time code for the bound phone number', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'stable-access-token',
        expires_in: 7200,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        errcode: 0,
        phone_info: {
          phoneNumber: '13800000000',
          purePhoneNumber: '13800000000',
          countryCode: '86',
        },
      })));
    vi.stubGlobal('fetch', fetchMock);
    const service = new AuthService({} as never, {} as never, {} as never);

    await expect(service.getWechatPhoneNumber('one-time-code')).resolves.toEqual({
      phoneNumber: '13800000000',
      purePhoneNumber: '13800000000',
      countryCode: '86',
    });
    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      'https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=stable-access-token',
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ code: 'one-time-code' }),
    });
  });

  it('rejects an empty phone code', async () => {
    const service = new AuthService({} as never, {} as never, {} as never);

    await expect(service.getWechatPhoneNumber(' ')).rejects.toThrow('手机号授权凭证不能为空');
  });

  it('surfaces a WeChat phone exchange failure', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'stable-access-token',
        expires_in: 7200,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        errcode: 40029,
        errmsg: 'invalid code',
      }))));
    const service = new AuthService({} as never, {} as never, {} as never);

    await expect(service.getWechatPhoneNumber('expired-code'))
      .rejects.toThrow('微信手机号授权已失效，请重试');
  });
});
