export const STATIC_CDN_BASE_URL = (import.meta.env.VITE_STATIC_CDN_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '');

export function staticAssetUrl(path: string): string {
  const assetPath = path.replace(/^\/+/, '');
  return STATIC_CDN_BASE_URL
    ? `${STATIC_CDN_BASE_URL}/${assetPath}`
    : `/baichile-home/${assetPath}`;
}

export function staticCloudFileId(path: string): string {
  const envId = (import.meta.env.VITE_CLOUDBASE_ENV_ID || '').trim();
  if (!envId) throw new Error('CloudBase 环境未配置');
  return `cloud://${envId}/baichile-home/${path.replace(/^\/+/, '')}`;
}
