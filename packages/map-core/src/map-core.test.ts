import { describe, expect, it } from 'vitest';
import { calculateDeliverySnapshot, formatAdministrativeArea, interpolateAlongPolyline } from './index';

const line = [
  { lat: 31, lng: 121, coordSystem: 'gcj02' as const },
  { lat: 31, lng: 122, coordSystem: 'gcj02' as const },
  { lat: 31, lng: 123, coordSystem: 'gcj02' as const },
];

describe('polyline interpolation', () => {
  it('interpolates by distance across the route', () => {
    expect(interpolateAlongPolyline(line, 0.75).lng).toBeCloseTo(122.5);
  });
});

describe('delivery snapshots', () => {
  it('derives progress from timestamps instead of accumulated ticks', () => {
    const result = calculateDeliverySnapshot(30_000, 0, 60_000);
    expect(result.progress).toBe(0.5);
    expect(result.status).toBe('delivering');
  });

  it('clamps completed deliveries', () => {
    const result = calculateDeliverySnapshot(90_000, 0, 60_000);
    expect(result.progress).toBe(1);
    expect(result.status).toBe('completed');
  });
});

describe('administrative area labels', () => {
  it('shows city and district without repeating municipality names', () => {
    expect(formatAdministrativeArea('上海市', '上海市', '浦东新区')).toBe('上海市 · 浦东新区');
  });

  it('shows province, city and county for non-municipalities', () => {
    expect(formatAdministrativeArea('浙江省', '杭州市', '余杭区')).toBe('浙江省 · 杭州市 · 余杭区');
  });
});
