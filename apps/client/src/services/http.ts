import type { ApiError } from '@baichile/api-contract';
import { API_BASE } from '../config/api';

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
  method: 'GET' | 'POST',
  path: string,
  accessToken: string,
  data?: unknown,
): Promise<T> {
  const isBodylessPost = method === 'POST' && data === undefined;
  return new Promise<T>((resolve, reject) => {
    uni.request({
      method,
      url: `${API_BASE}${path}`,
      data: data as UniApp.RequestOptions['data'],
      header: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(isBodylessPost ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      success: (response) => {
        if (response.statusCode < 400) {
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
