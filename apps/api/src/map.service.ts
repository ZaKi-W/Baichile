import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AdministrativeArea } from '@baichile/api-contract';

interface TencentGeocoderResponse {
  status: number;
  message: string;
  result?: {
    ad_info: { adcode: string };
    address_component: { province: string; city: string; district: string };
  };
}

@Injectable()
export class MapService {
  async reverseGeocode(lat: number, lng: number): Promise<AdministrativeArea> {
    const key = process.env.TENCENT_MAP_KEY;
    if (!key) throw new ServiceUnavailableException('尚未配置腾讯位置服务 Key');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new BadGatewayException('定位坐标无效');
    }
    const url = new URL('https://apis.map.qq.com/ws/geocoder/v1/');
    url.searchParams.set('location', `${lat},${lng}`);
    url.searchParams.set('key', key);
    url.searchParams.set('get_poi', '0');
    const response = await fetch(url);
    const body = await response.json() as TencentGeocoderResponse;
    if (!response.ok || body.status !== 0 || !body.result) {
      throw new BadGatewayException(body.message || '行政区解析失败');
    }
    const { province, city, district } = body.result.address_component;
    const adcode = body.result.ad_info.adcode;
    return {
      province,
      city,
      district,
      adcode,
      cityCode: `${adcode.slice(0, 4)}00`,
      districtCode: adcode,
    };
  }
}

