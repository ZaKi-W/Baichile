import type { AdministrativeArea, PlaceSuggestion } from '@baichile/api-contract';
import { API_BASE } from '../config/api';

const TENCENT_MAP_KEY = import.meta.env.VITE_TENCENT_MAP_KEY || '';

function mapErrorMessage(data: unknown): string {
  const message = data && typeof data === 'object' && 'message' in data
    ? String((data as { message?: unknown }).message ?? '')
    : '';
  if (/每日调用量已达到上限|quota|limit/i.test(message)) {
    return '地图服务今日额度已用完，请稍后再试';
  }
  return message || '地图服务请求失败';
}

function get<T>(url: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    uni.request({
      url,
      success: (response) => response.statusCode < 400
        ? resolve(response.data as T)
        : reject(new Error(mapErrorMessage(response.data))),
      fail: () => reject(new Error('网络连接失败')),
    });
  });
}

export async function reverseGeocode(lat: number, lng: number): Promise<AdministrativeArea> {
  if (API_BASE) {
    return get<AdministrativeArea>(`${API_BASE}/v1/map/reverse-geocode?lat=${lat}&lng=${lng}`);
  }
  if (!TENCENT_MAP_KEY) throw new Error('尚未配置腾讯位置服务 Key');
  const body = await get<{
    status: number;
    message: string;
    result?: {
      address?: string;
      ad_info: { adcode: string };
      address_component: { province: string; city: string; district: string };
    };
  }>(`https://apis.map.qq.com/ws/geocoder/v1/?location=${lat},${lng}&key=${TENCENT_MAP_KEY}&get_poi=0`);
  if (body.status !== 0 || !body.result) throw new Error(body.message || '行政区解析失败');
  const { province, city, district } = body.result.address_component;
  const adcode = body.result.ad_info.adcode;
  return {
    province, city, district, address: body.result.address, adcode,
    cityCode: `${adcode.slice(0, 4)}00`, districtCode: adcode,
  };
}

export async function nearbyPlaces(lat: number, lng: number): Promise<PlaceSuggestion[]> {
  if (API_BASE) {
    return get<PlaceSuggestion[]>(`${API_BASE}/v1/map/nearby?lat=${lat}&lng=${lng}`);
  }
  if (!TENCENT_MAP_KEY) throw new Error('尚未配置腾讯位置服务 Key');
  const params = new URLSearchParams({
    keyword: '小区',
    boundary: `nearby(${lat},${lng},3000)`,
    page_size: '20',
    page_index: '1',
    key: TENCENT_MAP_KEY,
  });
  const body = await get<{
    status: number;
    message: string;
    data?: Array<{
      id: string;
      title: string;
      address: string;
      province: string;
      city: string;
      district: string;
      location: { lat: number; lng: number };
    }>;
  }>(`https://apis.map.qq.com/ws/place/v1/search/?${params.toString()}`);
  if (body.status !== 0) throw new Error(body.message || '附近地点搜索失败');
  if (!body.data) return [];
  return body.data.map((item) => ({
    id: item.id,
    title: item.title,
    address: item.address,
    province: item.province,
    city: item.city,
    district: item.district,
    lat: item.location.lat,
    lng: item.location.lng,
  }));
}

export async function suggestPlaces(keyword: string, region?: string): Promise<PlaceSuggestion[]> {
  if (!keyword?.trim()) return [];
  if (API_BASE) {
    const params = new URLSearchParams({ keyword: keyword.trim() });
    if (region) params.set('region', region);
    return get<PlaceSuggestion[]>(`${API_BASE}/v1/map/suggest?${params.toString()}`);
  }
  if (!TENCENT_MAP_KEY) throw new Error('尚未配置腾讯位置服务 Key');
  const params = new URLSearchParams({ keyword: keyword.trim(), key: TENCENT_MAP_KEY, page_size: '10' });
  if (region) {
    params.set('region', region);
    params.set('region_fix', '1');
  }
  const body = await get<{
    status: number;
    message: string;
    data?: Array<{
      id: string;
      title: string;
      address: string;
      province: string;
      city: string;
      district: string;
      location: { lat: number; lng: number };
    }>;
  }>(`https://apis.map.qq.com/ws/place/v1/suggestion/?${params.toString()}`);
  if (body.status !== 0) throw new Error(body.message || '地点搜索失败');
  if (!body.data) return [];
  return body.data.map((item) => ({
    id: item.id,
    title: item.title,
    address: item.address,
    province: item.province,
    city: item.city,
    district: item.district,
    lat: item.location.lat,
    lng: item.location.lng,
  }));
}
