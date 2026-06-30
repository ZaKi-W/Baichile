import { defineStore } from 'pinia';
import type { GeoPoint } from '@baichile/map-core';
import { formatAdministrativeArea } from '@baichile/map-core';
import type { AdministrativeArea } from '@baichile/api-contract';
import { reverseGeocode } from '../services/location';

const LOCATION_KEY = 'baichile:last-location';
const AREA_KEY = 'baichile:last-area';

export const useLocationStore = defineStore('location', {
  state: () => ({
    point: (uni.getStorageSync(LOCATION_KEY) || null) as GeoPoint | null,
    area: (uni.getStorageSync(AREA_KEY) || null) as AdministrativeArea | null,
    status: 'idle' as 'idle' | 'locating' | 'ready' | 'denied' | 'error',
  }),
  getters: {
    label: (state) => state.area
      ? formatAdministrativeArea(state.area.province, state.area.city, state.area.district)
      : state.point ? '已定位，正在确认市区' : '点击获取当前位置',
  },
  actions: {
    async locate() {
      if (this.status === 'locating') return;
      this.status = 'locating';
      try {
        const result = await uni.getLocation({
          type: 'gcj02',
          isHighAccuracy: true,
          highAccuracyExpireTime: 5000,
        });
        this.point = { lat: result.latitude, lng: result.longitude, coordSystem: 'gcj02' };
        this.area = await reverseGeocode(result.latitude, result.longitude);
        this.status = 'ready';
        uni.setStorageSync(LOCATION_KEY, this.point);
        uni.setStorageSync(AREA_KEY, this.area);
        uni.showToast({ title: '定位成功', icon: 'success' });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.status = /auth deny|authorize|permission/i.test(message) ? 'denied' : 'error';
        uni.showModal({
          title: this.status === 'denied' ? '需要定位权限' : '定位失败',
          content: this.status === 'denied'
            ? '请在设置中允许定位；定位仅用于生成虚拟路线终点。'
            : '暂时无法获取位置，你仍可使用虚拟地点完成下单。',
          confirmText: this.status === 'denied' ? '去设置' : '知道了',
          success: ({ confirm }) => {
            if (confirm && this.status === 'denied') uni.openSetting({});
          },
        });
      }
    },
    clear() {
      this.point = null;
      this.area = null;
      this.status = 'idle';
      uni.removeStorageSync(LOCATION_KEY);
      uni.removeStorageSync(AREA_KEY);
    },
  },
});
