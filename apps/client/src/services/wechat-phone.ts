import type { WechatPhoneResult } from '@baichile/api-contract';
import { requestApi } from './http';

export function wechatPhoneFailureMessage(errMsg = ''): string {
  if (/deny|cancel/i.test(errMsg)) return '已取消授权，可手动输入手机号';
  return '未获得手机号，请确认小程序已开通手机号能力';
}

export async function exchangeWechatPhoneCode(code: string): Promise<string> {
  const result = await requestApi<WechatPhoneResult>(
    'POST',
    '/v1/auth/wechat-phone',
    '',
    { code },
  );
  return result.phoneNumber;
}
