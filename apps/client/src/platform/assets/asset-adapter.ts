export interface AssetAdapter {
  resolve(objectKey: string): string;
}

export const localAssetAdapter: AssetAdapter = {
  resolve(objectKey) {
    return `/static/${objectKey.replace(/^\/+/, '')}`;
  },
};

export function createCosAssetAdapter(baseUrl: string): AssetAdapter {
  if (!baseUrl) throw new Error('COS CDN 地址未配置');
  return { resolve: (objectKey) => `${baseUrl.replace(/\/$/, '')}/${objectKey.replace(/^\/+/, '')}` };
}

