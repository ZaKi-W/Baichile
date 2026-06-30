export type MapMode = 'tencent' | 'development-preview';

export function getMapMode(): MapMode {
  const key = import.meta.env.VITE_TENCENT_MAP_KEY;
  if (key) return 'tencent';
  if (import.meta.env.PROD) {
    throw new Error('生产构建缺少 VITE_TENCENT_MAP_KEY，不能使用开发路线预览');
  }
  return 'development-preview';
}

