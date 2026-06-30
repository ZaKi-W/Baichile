import type { AdministrativeArea } from '@baichile/api-contract';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const TENCENT_MAP_KEY = import.meta.env.VITE_TENCENT_MAP_KEY || '';

function get<T>(url: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    uni.request({
      url,
      success: (response) => response.statusCode < 400 ? resolve(response.data as T) : reject(new Error('行政区解析失败')),
      fail: reject,
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
    result?: { ad_info: { adcode: string }; address_component: { province: string; city: string; district: string } };
  }>(`https://apis.map.qq.com/ws/geocoder/v1/?location=${lat},${lng}&key=${TENCENT_MAP_KEY}&get_poi=0`);
  if (body.status !== 0 || !body.result) throw new Error(body.message || '行政区解析失败');
  const { province, city, district } = body.result.address_component;
  const adcode = body.result.ad_info.adcode;
  return { province, city, district, adcode, cityCode: `${adcode.slice(0, 4)}00`, districtCode: adcode };
}

