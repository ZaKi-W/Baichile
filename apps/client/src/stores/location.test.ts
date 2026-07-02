import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const reverseGeocode = vi.fn();

vi.mock('../services/location', () => ({
  reverseGeocode,
}));

describe('location store', () => {
  const storage = new Map<string, unknown>();

  beforeEach(() => {
    vi.resetModules();
    reverseGeocode.mockReset();
    storage.clear();
    setActivePinia(createPinia());
    vi.stubGlobal('uni', {
      getStorageSync: vi.fn((key: string) => storage.get(key) ?? ''),
      setStorageSync: vi.fn((key: string, value: unknown) => storage.set(key, value)),
      removeStorageSync: vi.fn((key: string) => storage.delete(key)),
      getLocation: vi.fn(),
      showModal: vi.fn(),
      showToast: vi.fn(),
      openSetting: vi.fn(),
    });
  });

  async function createStore() {
    const { useLocationStore } = await import('./location');
    return useLocationStore();
  }

  it('restores cached coordinates as ready without locating again', async () => {
    storage.set('baichile:last-location', { lat: 31.2, lng: 121.5, coordSystem: 'gcj02' });
    storage.set('baichile:last-area', {
      province: '上海市', city: '上海市', district: '浦东新区',
      adcode: '310115', cityCode: '310100', districtCode: '310115',
    });

    const location = await createStore();

    expect(location.status).toBe('ready');
    expect(location.label).toBe('浦东新区');
    expect(uni.getLocation).not.toHaveBeenCalled();
  });

  it('keeps successful coordinates when reverse geocoding fails', async () => {
    vi.mocked(uni.getLocation).mockResolvedValue({
      latitude: 31.2,
      longitude: 121.5,
    } as never);
    reverseGeocode.mockRejectedValue(new Error('request:fail timeout'));

    const location = await createStore();
    await location.locate();

    expect(location.status).toBe('ready');
    expect(location.point).toEqual({ lat: 31.2, lng: 121.5, coordSystem: 'gcj02' });
    expect(storage.get('baichile:last-location')).toEqual(location.point);
    expect(uni.showModal).not.toHaveBeenCalled();
    expect(uni.showToast).toHaveBeenCalledWith({
      title: '已获取位置，地区名称暂不可用',
      icon: 'none',
    });
  });

  it('falls back to standard accuracy after a high-accuracy timeout', async () => {
    vi.mocked(uni.getLocation)
      .mockRejectedValueOnce({ errMsg: 'getLocation:fail timeout' })
      .mockResolvedValueOnce({ latitude: 31.2, longitude: 121.5 } as never);
    reverseGeocode.mockResolvedValue({
      province: '上海市', city: '上海市', district: '浦东新区',
      adcode: '310115', cityCode: '310100', districtCode: '310115',
    });

    const location = await createStore();
    await location.locate();

    expect(uni.getLocation).toHaveBeenNthCalledWith(1, {
      type: 'gcj02',
      isHighAccuracy: true,
      highAccuracyExpireTime: 8000,
    });
    expect(uni.getLocation).toHaveBeenNthCalledWith(2, { type: 'gcj02' });
    expect(location.status).toBe('ready');
  });

  it('recognizes a WeChat errMsg permission denial without retrying', async () => {
    vi.mocked(uni.getLocation).mockRejectedValue({
      errMsg: 'getLocation:fail auth deny',
    });

    const location = await createStore();
    await location.locate();

    expect(location.status).toBe('denied');
    expect(uni.getLocation).toHaveBeenCalledTimes(1);
    expect(uni.showModal).toHaveBeenCalledWith(expect.objectContaining({
      title: '需要定位权限',
      confirmText: '去设置',
    }));
  });
});
