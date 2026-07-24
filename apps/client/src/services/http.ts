import type { ApiError } from '@baichile/api-contract';
import { CLOUDBASE_API_FUNCTION, CLOUDBASE_ENV_ID, USE_CLOUDBASE_API } from '../config/api';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code?: ApiError['code'],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export function requestApi<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  accessToken: string,
  data?: unknown,
): Promise<T> {
  if (canUseCloudBase()) {
    return requestCloudFunction<T>(method, path, accessToken, data);
  }
  return Promise.reject(new ApiRequestError('云开发环境未初始化'));
}

function canUseCloudBase(): boolean {
  return USE_CLOUDBASE_API && Boolean(CLOUDBASE_ENV_ID) && resolveCloudTransport() !== 'unavailable';
}

async function requestCloudFunction<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  accessToken: string,
  data?: unknown,
): Promise<T> {
  try {
    // #ifdef H5
    if (resolveCloudTransport() === 'web') {
      const { callWebCloudFunction } = await import('../platform/cloudbase-web');
      const webResult = await callWebCloudFunction({
        method,
        path,
        data,
        authorization: accessToken ? `Bearer ${accessToken}` : '',
      });
      return unwrapCloudFunctionResult<T>(webResult);
    }
    // #endif
    // #ifdef MP-WEIXIN
    const cloud = typeof wx !== 'undefined' ? wx.cloud : undefined;
    if (!cloud) throw new ApiRequestError('云开发环境未初始化');
    const response = await cloud.callFunction({
      name: CLOUDBASE_API_FUNCTION,
      data: {
        method,
        path,
        data,
        authorization: accessToken ? `Bearer ${accessToken}` : '',
      },
    });
    return unwrapCloudFunctionResult<T>(response.result);
    // #endif
    throw new ApiRequestError('当前平台不支持云函数调用');
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError(requestFailureMessage(error));
  }
}

function requestFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    for (const key of ['message', 'error_description', 'errMsg']) {
      if (typeof record[key] === 'string' && record[key]) return record[key];
    }
    if (typeof record.code === 'string' && record.code) return `云函数调用失败（${record.code}）`;
  }
  return '网络连接失败';
}

export function resolveCloudTransport(): 'wechat' | 'web' | 'unavailable' {
  if (typeof wx !== 'undefined' && wx.cloud) return 'wechat';
  if (typeof window !== 'undefined') return 'web';
  return 'unavailable';
}

export function unwrapCloudFunctionResult<T>(value: unknown): T {
  const body = value && typeof value === 'object'
    ? value as {
        ok?: boolean;
        data?: T;
        code?: ApiError['code'];
        message?: string;
      }
    : {};
  if (body.ok) return body.data as T;
  throw new ApiRequestError(body.message || '接口请求失败', body.code);
}
