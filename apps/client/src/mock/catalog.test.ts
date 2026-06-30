import { describe, expect, it } from 'vitest';
import { mockStores } from './catalog';

describe('mock store metrics', () => {
  it('provides valid and varied operating metrics for every store', () => {
    for (const store of mockStores) {
      expect(Number.isInteger(store.monthlySales)).toBe(true);
      expect(store.monthlySales).toBeGreaterThanOrEqual(0);
      expect(store.distanceKm).toBeGreaterThanOrEqual(0);
      expect(store.rating).toBeGreaterThanOrEqual(0);
      expect(store.rating).toBeLessThanOrEqual(5);
      expect(Number.isInteger(store.recentViewers)).toBe(true);
      expect(store.recentViewers).toBeGreaterThanOrEqual(0);
    }

    expect(new Set(mockStores.map((store) => store.monthlySales)).size).toBeGreaterThan(1);
    expect(new Set(mockStores.map((store) => store.distanceKm)).size).toBeGreaterThan(1);
    expect(new Set(mockStores.map((store) => store.rating)).size).toBeGreaterThan(1);
    expect(new Set(mockStores.map((store) => store.recentViewers)).size).toBeGreaterThan(1);
    expect(mockStores.some((store) => store.deliveryFeeCents === 0)).toBe(true);
    expect(mockStores.some((store) => store.deliveryFeeCents > 0)).toBe(true);
  });
});
