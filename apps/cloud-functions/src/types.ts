export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface CloudFunctionEvent {
  method?: HttpMethod;
  path?: string;
  query?: Record<string, string | number | undefined>;
  data?: unknown;
  headers?: Record<string, string | undefined>;
  authorization?: string;
}

export interface RequestContext {
  method: HttpMethod;
  path: string;
  query: URLSearchParams;
  data: unknown;
  authorization?: string;
  openId?: string;
  ipAddress?: string;
  origin?: string;
}

export interface CloudResult<T = unknown> {
  ok: true;
  status: number;
  data: T;
}

export interface PageQuery {
  page?: string;
  pageSize?: string;
  keyword?: string;
  status?: string;
  categoryId?: string;
  storeId?: string;
  accountId?: string;
  type?: string;
  adminStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  action?: string;
  resourceType?: string;
}
