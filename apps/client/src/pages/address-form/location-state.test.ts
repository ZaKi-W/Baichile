import { describe, expect, it } from 'vitest';
import { locationSelection, placeSelection } from './location-state';

describe('address-form location state', () => {
  it('uses the GPS coordinates as the address coordinates', () => {
    expect(locationSelection(
      { latitude: 31.2304, longitude: 121.4737 },
      { province: '上海市', city: '上海市', district: '黄浦区' },
    )).toMatchObject({
      lat: 31.2304,
      lng: 121.4737,
    });
  });

  it('builds a readable address without repeating a municipality', () => {
    expect(locationSelection(
      { latitude: 31.2304, longitude: 121.4737 },
      { province: '上海市', city: '上海市', district: '黄浦区' },
    ).address).toBe('上海市黄浦区');
  });

  it('prefers the precise reverse-geocoded address when available', () => {
    expect(locationSelection(
      { latitude: 31.2304, longitude: 121.4737 },
      {
        province: '上海市',
        city: '上海市',
        district: '黄浦区',
        address: '上海市黄浦区人民大道200号',
      },
    ).address).toBe('上海市黄浦区人民大道200号');
  });

  it('collapses nearby places after one is selected', () => {
    expect(placeSelection({
      id: 'poi-1',
      title: '人民广场',
      address: '人民大道',
      province: '上海市',
      city: '上海市',
      district: '黄浦区',
      lat: 31.23,
      lng: 121.47,
    }).nearbyList).toEqual([]);
  });
});
