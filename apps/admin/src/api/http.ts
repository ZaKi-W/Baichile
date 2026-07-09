const CLOUDBASE_HTTP_API_URL = import.meta.env.VITE_CLOUDBASE_HTTP_API_URL ?? '';
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
  if (CLOUDBASE_HTTP_API_URL) return cloudbaseApi<T>(path, init);
  throw new ApiRequestError(500, 'CLOUDBASE_API_MISSING', '缺少 VITE_CLOUDBASE_HTTP_API_URL');
}

async function cloudbaseApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const method = (init.method ?? 'GET').toUpperCase();
  const url = new URL(path, 'https://example.invalid');
  const query = Object.fromEntries(url.searchParams.entries());
  const response = await fetch(CLOUDBASE_HTTP_API_URL, {
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
