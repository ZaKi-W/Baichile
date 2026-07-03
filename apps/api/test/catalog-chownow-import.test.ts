import { describe, expect, it } from 'vitest';
import {
  buildChownowImport,
  buildMultiSourceImport,
  cleanSubCategoryName,
  classifyChownowStore,
  normalizeCatalogName,
} from '../src/database/catalog.chownow-import';

describe('ChowNow catalog import', () => {
  it('keeps only stores with covers and menu items with downloaded images', () => {
    const result = buildChownowImport([
      {
        id: 'store-good',
        categoryId: 'default',
        name: 'Totoyama Ramen',
        rating: 4.8,
        cover: 'https://example.com/store.jpg',
        address: 'Los Angeles',
        subCategories: [{ id: 'ramen', name: 'Ramen', sortOrder: 1 }],
        menuItems: [
          {
            id: 'item-good',
            subCategoryId: 'ramen',
            name: 'Tonkotsu Ramen',
            price: 18.75,
            description: 'Pork broth',
            image_url: 'https://example.com/ramen.jpg',
            has_local_image: true,
            local_image_path: '/tmp/ramen.jpg',
          },
          {
            id: 'item-no-image',
            subCategoryId: 'ramen',
            name: 'Plain Rice',
            price: 3,
            image_url: '',
            has_local_image: false,
          },
        ],
      },
      {
        id: 'store-no-cover',
        name: 'Hidden Store',
        cover: '',
        menuItems: [{
          id: 'hidden-item',
          name: 'Hidden Item',
          price: 10,
          image_url: 'https://example.com/hidden.jpg',
          has_local_image: true,
        }],
      },
    ], () => true);

    expect(result.stores).toHaveLength(1);
    expect(result.stores[0]).toMatchObject({
      id: 'store-good',
      categoryId: 'japanese',
      coverUrl: 'https://example.com/store.jpg',
    });
    expect(result.menuItems).toEqual([
      expect.objectContaining({
        id: 'item-good',
        storeId: 'store-good',
        basePriceCents: 1875,
        imageUrl: 'https://example.com/ramen.jpg',
      }),
    ]);
  });

  it('fills merchant categories and cleans verbose in-store category names', () => {
    expect(classifyChownowStore('Groundwork Coffee')).toBe('coffee');
    expect(classifyChownowStore('Gong Cha')).toBe('tea');
    expect(classifyChownowStore('La Salsa - Figueroa St')).toBe('mexican');
    expect(classifyChownowStore('SUGARFISH by Sushi Nozawa')).toBe('japanese');
    expect(classifyChownowStore('Wok in Duane')).toBe('chinese');
    expect(classifyChownowStore("BROKEN MOUTH | Lee's Homestyle")).toBe('korean');
    expect(classifyChownowStore('Power Bowls')).toBe('healthy');
    expect(classifyChownowStore('Flouring Cake Shop')).toBe('dessert');
    expect(cleanSubCategoryName('Catering - If you need to contact us for delivery')).toBe('Catering');
  });

  it('deduplicates stores by normalized name and items by normalized name plus price', () => {
    const item = {
      subCategoryId: 'main',
      name: 'Chicken Burger!',
      price: 12.5,
      image_url: 'https://example.com/burger.jpg',
      has_local_image: true,
      local_image_path: '/tmp/burger.jpg',
    };
    const result = buildChownowImport([
      {
        id: 'first',
        name: 'DAVE’S  HOT-CHICKEN',
        cover: 'https://example.com/first.jpg',
        menuItems: [
          { ...item, id: 'short', description: '' },
          { ...item, id: 'complete', description: 'Crispy chicken with sauce' },
          { ...item, id: 'different-price', price: 13.5 },
        ],
      },
      {
        id: 'second',
        name: "Dave's Hot Chicken",
        cover: 'https://example.com/second.jpg',
        menuItems: [{ ...item, id: 'second-store-item' }],
      },
    ], () => true, { source: 'talabat' });

    expect(normalizeCatalogName(' DAVE’S  HOT-CHICKEN ')).toBe('dave s hot chicken');
    expect(result.stores).toHaveLength(1);
    expect(result.stores[0].id).toBe('talabat:first');
    expect(result.menuItems).toHaveLength(2);
    expect(result.menuItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'talabat:complete',
        subtitle: 'Crispy chicken with sauce',
        basePriceCents: 1250,
      }),
      expect.objectContaining({
        id: 'talabat:different-price',
        basePriceCents: 1350,
      }),
    ]));
  });

  it('deduplicates merchants across sources and applies cached Chinese names', () => {
    const makeStore = (id: string, name: string) => ({
      id,
      name,
      cover: 'https://example.com/store.jpg',
      menuItems: [{
        id: `${id}-item`,
        name: 'Hot Chicken',
        price: 12,
        image_url: 'https://example.com/item.jpg',
        has_local_image: true,
        local_image_path: '/tmp/item.jpg',
      }],
    });
    const result = buildMultiSourceImport([
      { source: 'ubereats', stores: [makeStore('one', "Dave's Hot Chicken")] },
      { source: 'talabat', stores: [makeStore('two', 'DAVE’S HOT CHICKEN')] },
    ], () => true, {
      'store:ubereats:one:translated': '戴夫热鸡店',
      'item:ubereats:one-item:translated': '辣鸡肉',
    }, (kind, source, id) => `${kind}:${source}:${id}:translated`);

    expect(result.stores).toHaveLength(1);
    expect(result.stores[0]).toMatchObject({ id: 'ubereats:one', name: '戴夫热鸡店' });
    expect(result.menuItems[0]).toMatchObject({
      id: 'ubereats:one-item',
      name: '辣鸡肉',
    });
  });
});
