import { defineStore } from 'pinia';
import type { GeoPoint } from '@baichile/map-core';
import type { AdministrativeArea, PlaceSuggestion } from '@baichile/api-contract';
import { reverseGeocode } from '../services/location';

const LOCATION_KEY = 'baichile:last-location';
const AREA_KEY = 'baichile:last-area';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'errMsg' in error) {
    return String((error as { errMsg?: unknown }).errMsg ?? '');
  }
  return String(error);
}

function isPermissionDenied(error: unknown): boolean {
  return /auth deny|authorize|permission|permission denied/i.test(errorMessage(error));
}

export const useLocationStore = defineStore('location', {
  state: () => {
    const point = (uni.getStorageSync(LOCATION_KEY) || null) as GeoPoint | null;
    return {
      point,
      area: (uni.getStorageSync(AREA_KEY) || null) as AdministrativeArea | null,
      status: (point ? 'ready' : 'idle') as 'idle' | 'locating' | 'ready' | 'denied' | 'error',
    };
  },
  getters: {
    label: (state) => state.area
      ? state.area.district
      : state.point ? '已定位，正在确认市区' : '点击获取当前位置',
  },
  actions: {
    async locate() {
      if (this.status === 'locating') return;
      this.status = 'locating';
      let result: Awaited<ReturnType<typeof uni.getLocation>>;
      try {
        result = await uni.getLocation({
          type: 'gcj02',
          isHighAccuracy: true,
          highAccuracyExpireTime: 8000,
        });
      } catch (highAccuracyError) {
        if (isPermissionDenied(highAccuracyError)) {
          this.showLocationError(highAccuracyError);
          return;
        }
        try {
          result = await uni.getLocation({ type: 'gcj02' });
        } catch (fallbackError) {
          this.showLocationError(fallbackError);
          return;
        }
      }

      this.point = { lat: result.latitude, lng: result.longitude, coordSystem: 'gcj02' };
      this.area = null;
      this.status = 'ready';
      uni.setStorageSync(LOCATION_KEY, this.point);
      uni.removeStorageSync(AREA_KEY);

      try {
        this.area = await reverseGeocode(result.latitude, result.longitude);
        uni.setStorageSync(AREA_KEY, this.area);
      } catch {
        uni.showToast({
          title: '已获取位置，地区名称暂不可用',
          icon: 'none',
        });
      }
    },
    showLocationError(error: unknown) {
      const denied = isPermissionDenied(error);
      this.status = denied ? 'denied' : 'error';
      uni.showModal({
        title: denied ? '需要定位权限' : '定位失败',
        content: denied
          ? '请在设置中允许定位；定位仅用于生成虚拟路线终点。'
          : '请确认系统定位服务已开启，或稍后重试。你仍可手动选择地区。',
        confirmText: denied ? '去设置' : '知道了',
        success: ({ confirm }) => {
          if (confirm && denied) uni.openSetting({});
        },
      });
    },
    clear() {
      this.point = null;
      this.area = null;
      this.status = 'idle';
      uni.removeStorageSync(LOCATION_KEY);
      uni.removeStorageSync(AREA_KEY);
    },
    async selectPlace(place: PlaceSuggestion) {
      this.point = { lat: place.lat, lng: place.lng, coordSystem: 'gcj02' };
      try {
        this.area = await reverseGeocode(place.lat, place.lng);
      } catch {
        this.area = {
          province: place.province, city: place.city, district: place.district,
          adcode: '', cityCode: '', districtCode: '',
        };
      }
      this.status = 'ready';
      uni.setStorageSync(LOCATION_KEY, this.point);
      uni.setStorageSync(AREA_KEY, this.area);
    },
  },
});
