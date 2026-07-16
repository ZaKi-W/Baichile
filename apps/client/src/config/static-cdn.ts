export const STATIC_CDN_BASE_URL = 'https://cloud1-d8g7o18ula3c12f10-1318253748.tcloudbaseapp.com/baichile-home';

export function staticAssetUrl(path: string): string {
  return `${STATIC_CDN_BASE_URL}/${path.replace(/^\/+/, '')}`;
}
