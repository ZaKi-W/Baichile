function resolveAdminApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_ADMIN_API_BASE_URL?.trim()
    || import.meta.env.VITE_CLOUDBASE_HTTP_API_URL?.trim();
  if (explicit) return explicit;

  const envId = import.meta.env.VITE_CLOUDBASE_ENV_ID?.trim();
  if (envId) {
    if (!/^[a-zA-Z0-9-]+$/.test(envId)) {
      throw new Error('VITE_CLOUDBASE_ENV_ID 格式不正确');
    }
    return `https://${envId}.service.tcloudbase.com/admin-api`;
  }
  return import.meta.env.DEV ? '/' : '';
}

const ADMIN_API_BASE_URL = resolveAdminApiBaseUrl();
const TOKEN_KEY = 'baichile_admin_token';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function getToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? '';
}

export function setToken(token: string): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function toQuery(
  values: Record<string, string | number | null | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== '' && value !== null && value !== undefined) params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (ADMIN_API_BASE_URL) return cloudbaseApi<T>(path, init);
  throw new ApiRequestError(
    500,
    'CLOUDBASE_API_MISSING',
    '缺少 VITE_ADMIN_API_BASE_URL 或 VITE_CLOUDBASE_ENV_ID',
  );
}

async function cloudbaseApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const method = (init.method ?? 'GET').toUpperCase();
  const url = new URL(path, 'https://example.invalid');
  const query = Object.fromEntries(url.searchParams.entries());
  const response = await fetch(ADMIN_API_BASE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      method,
      path: `${url.pathname}${url.search}`,
      query,
      data: init.body ? JSON.parse(String(init.body)) : undefined,
      authorization: token ? `Bearer ${token}` : '',
    }),
  });
  const body = await response.json().catch(() => ({})) as {
    ok?: boolean;
    status?: number;
    data?: T;
    code?: string;
    message?: string;
  };
  if (!response.ok || !body.ok) {
    if (body.status === 401) setToken('');
    throw new ApiRequestError(
      body.status ?? response.status,
      body.code ?? 'REQUEST_FAILED',
      body.message ?? '请求失败，请稍后重试',
    );
  }
  return body.data as T;
}
