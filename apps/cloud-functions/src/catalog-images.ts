export const CATALOG_IMAGE_LOCAL_PREFIX = '/static/choutuan-img/';
export const CATALOG_IMAGE_LOCAL_PREFIXES = [
  CATALOG_IMAGE_LOCAL_PREFIX,
  '/static/japanese-buffet-img/',
  '/static/kamii-buffet-img/',
] as const;
export const CATALOG_IMAGE_CLOUD_PATH = 'choutuan-img';
export const EXPECTED_CATALOG_IMAGE_COUNT = 760;
export const DEFAULT_CATALOG_IMAGE_UPLOAD_TARGET = 'hosting';

export function normalizeCatalogImageBaseUrl(value = process.env.CATALOG_IMAGE_BASE_URL): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!/^(https?:\/\/|cloud:\/\/)/.test(trimmed)) {
    throw new Error('CATALOG_IMAGE_BASE_URL 必须是 http(s) URL 或 cloud:// 文件前缀');
  }
  return trimmed.replace(/\/+$/, '');
}

export function resolveCatalogImageUrl(value: string | null | undefined, baseUrl = normalizeCatalogImageBaseUrl()): string | null {
  if (!value) return null;
  if (!baseUrl || !CATALOG_IMAGE_LOCAL_PREFIXES.some((prefix) => value.startsWith(prefix))) return value;
  return `${baseUrl}/${value.slice('/static/'.length)}`;
}

export function requireCatalogImageBaseUrl(value = process.env.CATALOG_IMAGE_BASE_URL): string {
  const baseUrl = normalizeCatalogImageBaseUrl(value);
  if (!baseUrl || !/^https:\/\//.test(baseUrl)) {
    throw new Error('CATALOG_IMAGE_BASE_URL 必须配置为 HTTPS CDN 地址，目录图片不能使用本地路径或 cloud:// 临时链接');
  }
  return baseUrl;
}

export function rewriteCatalogRecordImages<T extends Record<string, unknown>>(
  collection: string,
  row: T,
  baseUrl = normalizeCatalogImageBaseUrl(),
): T {
  if (!baseUrl) return row;
  if (collection === 'stores' && typeof row.coverUrl === 'string') {
    return { ...row, coverUrl: resolveCatalogImageUrl(row.coverUrl, baseUrl) } as T;
  }
  if (collection === 'menu_items' && typeof row.imageUrl === 'string') {
    return { ...row, imageUrl: resolveCatalogImageUrl(row.imageUrl, baseUrl) } as T;
  }
  return row;
}
