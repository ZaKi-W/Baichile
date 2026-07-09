export const CATALOG_IMAGE_LOCAL_PREFIX = '/static/choutuan-img/';
export const CATALOG_IMAGE_CLOUD_PATH = 'choutuan-img';
export const EXPECTED_CATALOG_IMAGE_COUNT = 760;
export const DEFAULT_CATALOG_IMAGE_UPLOAD_TARGET = 'hosting';

export function normalizeCatalogImageBaseUrl(value = process.env.CATALOG_IMAGE_BASE_URL): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//.test(trimmed)) {
    throw new Error('CATALOG_IMAGE_BASE_URL 必须是 http(s) URL');
  }
  return trimmed.replace(/\/+$/, '');
}

export function resolveCatalogImageUrl(value: string | null | undefined, baseUrl = normalizeCatalogImageBaseUrl()): string | null {
  if (!value) return null;
  if (!baseUrl || !value.startsWith(CATALOG_IMAGE_LOCAL_PREFIX)) return value;
  return `${baseUrl}/${value.slice(CATALOG_IMAGE_LOCAL_PREFIX.length)}`;
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
