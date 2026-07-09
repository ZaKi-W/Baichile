const CATALOG_IMAGE_LOCAL_PREFIX = '/static/choutuan-img/';

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
