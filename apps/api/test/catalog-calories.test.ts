import { describe, expect, it } from 'vitest';
import { stores } from '../src/catalog.seed';

describe('catalog calorie estimates', () => {
  it('covers every menu item with traceable positive integer calories', () => {
    const items = stores.flatMap((store) => store.menu);

    expect(items.length).toBeGreaterThanOrEqual(800);
    for (const item of items) {
      expect(item.caloriesKcal, item.name).toBeGreaterThan(0);
      expect(Number.isInteger(item.caloriesKcal), item.name).toBe(true);
      expect(item.calorieSource.type, item.name).toMatch(/official|composition_estimate/);
      expect(item.calorieSource.description, item.name).not.toBe('');
      expect(item.calorieSource.referenceUrl, item.name).toMatch(/^https:\/\//);
    }
  });

  it('assigns calorie deltas to every specification option', () => {
    for (const item of stores.flatMap((store) => store.menu)) {
      for (const option of item.specGroups.flatMap((group) => group.options)) {
        expect(Number.isInteger(option.calorieDeltaKcal), `${item.name}/${option.name}`).toBe(true);
      }
    }
  });
});
