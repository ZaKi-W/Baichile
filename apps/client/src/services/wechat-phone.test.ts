import { afterEach, describe, expect, it, vi } from 'vitest';
import { exchangeWechatPhoneCode, wechatPhoneFailureMessage } from './wechat-phone';

describe('WeChat phone service', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the one-time code and returns the bound phone number', async () => {
    const callFunction = vi.fn().mockResolvedValue({
      result: {
        ok: true,
        data: {
          phoneNumber: '13800000000',
          purePhoneNumber: '13800000000',
          countryCode: '86',
        },
      },
    });
    vi.stubGlobal('wx', {
      cloud: { callFunction },
    });

    await expect(exchangeWechatPhoneCode('phone-code')).resolves.toBe('13800000000');
    expect(callFunction).toHaveBeenCalledWith({
      name: 'api',
      data: {
        method: 'POST',
        path: '/v1/auth/wechat-phone',
        data: { code: 'phone-code' },
        authorization: '',
      },
    });
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
