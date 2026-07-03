import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AdministrativeArea, PlaceSuggestion } from '@baichile/api-contract';

interface TencentGeocoderResponse {
  status: number;
  message: string;
  result?: {
    address?: string;
    ad_info: { adcode: string };
    address_component: { province: string; city: string; district: string };
  };
}

interface TencentSuggestionResponse {
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
      address: body.result.address,
      adcode,
      cityCode: `${adcode.slice(0, 4)}00`,
      districtCode: adcode,
    };
  }

  async nearbyPlaces(lat: number, lng: number, keyword = '', radius = 3000): Promise<PlaceSuggestion[]> {
    const key = process.env.TENCENT_MAP_KEY;
    if (!key) throw new ServiceUnavailableException('尚未配置腾讯位置服务 Key');

    const url = new URL('https://apis.map.qq.com/ws/place/v1/search/');
    url.searchParams.set('keyword', keyword || '小区');
    url.searchParams.set('boundary', `nearby(${lat},${lng},${radius})`);
    url.searchParams.set('page_size', '20');
    url.searchParams.set('page_index', '1');
    url.searchParams.set('key', key);

    const response = await fetch(url);
    const body = await response.json() as TencentSuggestionResponse;
    if (!response.ok || body.status !== 0) {
      throw new BadGatewayException(body.message || '附近地点搜索失败');
    }
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

  async suggestPlaces(keyword: string, region?: string): Promise<PlaceSuggestion[]> {
    const key = process.env.TENCENT_MAP_KEY;
    if (!key) throw new ServiceUnavailableException('尚未配置腾讯位置服务 Key');
    if (!keyword?.trim()) return [];

    const url = new URL('https://apis.map.qq.com/ws/place/v1/suggestion/');
    url.searchParams.set('keyword', keyword.trim());
    url.searchParams.set('key', key);
    if (region) {
      url.searchParams.set('region', region);
      url.searchParams.set('region_fix', '1');
    }
    url.searchParams.set('page_size', '10');

    const response = await fetch(url);
    const body = await response.json() as TencentSuggestionResponse;
    if (!response.ok || body.status !== 0) {
      throw new BadGatewayException(body.message || '地点搜索失败');
    }
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
}
