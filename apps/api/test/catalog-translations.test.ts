import { describe, expect, it } from 'vitest';
import {
  buildCatalogTranslations,
  catalogTranslationKey,
  translateMerchantName,
  type CatalogTranslationEntry,
} from '../src/scripts/catalog-translations';

describe('catalog translations', () => {
  it('uses source, id, and original text in stable cache keys', () => {
    expect(catalogTranslationKey('item', 'talabat', '42', 'Hot Chicken'))
      .not.toBe(catalogTranslationKey('item', 'talabat', '42', 'Hot Chicken Meal'));
    expect(catalogTranslationKey('item', 'talabat', '42', 'Hot Chicken'))
      .toBe(catalogTranslationKey('item', 'talabat', '42', 'Hot Chicken'));
  });

  it('uses official merchant names and preserves unknown brand names', async () => {
    const translate = async (text: string) => `中:${text}`;
    await expect(translateMerchantName("McDonald's® (L/A-6345Wilshire)", translate))
      .resolves.toBe('麦当劳（中:L/A-6345Wilshire）');
    await expect(translateMerchantName("Dave's Hot Chicken", translate))
      .resolves.toBe("Dave's Hot Chicken");
    await expect(translateMerchantName('Gong Cha - Downtown LA', translate))
      .resolves.toBe('贡茶 - 中:Downtown LA');
  });

  it('reuses cached values and falls back to original text after translation failure', async () => {
    const entries: CatalogTranslationEntry[] = [
      { kind: 'item', source: 'talabat', id: '1', original: 'Hot Chicken' },
      { kind: 'item', source: 'talabat', id: '2', original: 'Failed Dish' },
    ];
    const firstKey = catalogTranslationKey('item', 'talabat', '1', 'Hot Chicken');
    let calls = 0;
    const result = await buildCatalogTranslations(entries, { [firstKey]: '辣鸡肉' }, async () => {
      calls += 1;
      throw new Error('offline');
    });

    expect(calls).toBe(1);
    expect(result[firstKey]).toBe('辣鸡肉');
    expect(result[catalogTranslationKey('item', 'talabat', '2', 'Failed Dish')])
      .toBe('Failed Dish');
  });

  it('limits translation concurrency', async () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      kind: 'item' as const,
      source: 'test',
      id: String(index),
      original: `Dish ${index}`,
    }));
    let active = 0;
    let maximumActive = 0;
    await buildCatalogTranslations(entries, {}, async (text) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return `中:${text}`;
    }, undefined, 2);

    expect(maximumActive).toBe(2);
  });
});
