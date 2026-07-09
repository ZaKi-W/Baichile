import type { ApiError } from '@baichile/api-contract';
import { API_BASE, CLOUDBASE_API_FUNCTION, USE_CLOUDBASE_API } from '../config/api';

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
  const isBodylessPost = method === 'POST' && data === undefined;
  return new Promise<T>((resolve, reject) => {
    uni.request({
      method: method as UniApp.RequestOptions['method'],
      url: `${API_BASE}${path}`,
      data: data as UniApp.RequestOptions['data'],
      header: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(isBodylessPost ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      success: (response) => {
        if ((response.statusCode ?? 200) < 400) {
          resolve(response.data as T);
          return;
        }
        const body = response.data as Partial<ApiError> | undefined;
        reject(new ApiRequestError(body?.message || '接口请求失败', body?.code));
      },
      fail: () => reject(new ApiRequestError('网络连接失败')),
    });
  });
}

function canUseCloudBase(): boolean {
  return USE_CLOUDBASE_API && typeof wx !== 'undefined' && Boolean(wx.cloud);
}

async function requestCloudFunction<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  accessToken: string,
  data?: unknown,
): Promise<T> {
  try {
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
    const body = response.result as {
      ok?: boolean;
      status?: number;
      data?: T;
      code?: ApiError['code'];
      message?: string;
    };
    if (body?.ok) return body.data as T;
    throw new ApiRequestError(body?.message || '接口请求失败', body?.code);
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError('网络连接失败');
  }
}
