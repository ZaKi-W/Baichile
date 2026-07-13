import type { ApiError } from '@baichile/api-contract';

export class CloudApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiError['code'] | string,
    message: string,
  ) {
    super(message);
    this.name = 'CloudApiError';
  }
}

export function badRequest(message: string, code = 'BAD_REQUEST'): never {
  throw new CloudApiError(400, code, message);
}

export function unauthorized(message = '请先登录', code = 'UNAUTHORIZED'): never {
  throw new CloudApiError(401, code, message);
}

export function forbidden(message = '没有操作权限', code = 'FORBIDDEN'): never {
  throw new CloudApiError(403, code, message);
}

export function notFound(message: string, code = 'NOT_FOUND'): never {
  throw new CloudApiError(404, code, message);
}

export function conflict(message: string, code = 'CONFLICT'): never {
  throw new CloudApiError(409, code, message);
}

export function tooManyRequests(message = '请求过于频繁，请稍后再试', code = 'RATE_LIMITED'): never {
  throw new CloudApiError(429, code, message);
}

export function toErrorBody(error: unknown) {
  if (error instanceof CloudApiError) {
    return { ok: false, status: error.status, code: error.code, message: error.message };
  }
  const message = error instanceof Error ? error.message : '服务暂不可用';
  return { ok: false, status: 500, code: 'INTERNAL_ERROR', message };
}
