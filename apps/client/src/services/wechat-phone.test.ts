import { afterEach, describe, expect, it, vi } from 'vitest';
import { exchangeWechatPhoneCode, wechatPhoneFailureMessage } from './wechat-phone';

describe('WeChat phone service', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the one-time code and returns the bound phone number', async () => {
    let requestOptions: UniApp.RequestOptions | undefined;
    vi.stubGlobal('uni', {
      request(options: UniApp.RequestOptions) {
        requestOptions = options;
        options.success?.({
          data: {
            phoneNumber: '13800000000',
            purePhoneNumber: '13800000000',
            countryCode: '86',
          },
          statusCode: 201,
          header: {},
          cookies: [],
          errMsg: 'request:ok',
        });
      },
    });

    await expect(exchangeWechatPhoneCode('phone-code')).resolves.toBe('13800000000');
    expect(requestOptions).toMatchObject({
      method: 'POST',
      data: { code: 'phone-code' },
    });
    expect(requestOptions?.url).toContain('/v1/auth/wechat-phone');
  });

  it('explains when the user cancels phone authorization', () => {
    expect(wechatPhoneFailureMessage('getPhoneNumber:fail user deny'))
      .toBe('已取消授权，可手动输入手机号');
  });

  it('explains when WeChat returns no phone code', () => {
    expect(wechatPhoneFailureMessage('getPhoneNumber:fail no permission'))
      .toBe('未获得手机号，请确认小程序已开通手机号能力');
  });
});
