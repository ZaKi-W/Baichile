export type MapMode = 'tencent' | 'development-preview';

export function getMapMode(): MapMode {
  const key = import.meta.env.VITE_TENCENT_MAP_KEY;
  if (key) return 'tencent';
  return 'development-preview';
}
