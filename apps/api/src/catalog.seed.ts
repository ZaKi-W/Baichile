import type { Category, MenuItem, StoreDetail } from '@baichile/api-contract';

export const categories: Category[] = [
  ['bbq', '烧烤', 'bbq'], ['fried', '炸鸡', 'friedChicken'], ['burger', '汉堡', 'burger'],
  ['noodles', '粉面', 'noodles'], ['rice', '盖饭', 'rice'], ['tea', '奶茶', 'milkTea'],
  ['dessert', '甜品', 'dessert'], ['night', '夜宵', 'lateNight'],
].map(([id, name, icon]) => ({ id, name, icon }));

const storeNames = [
  '炭火小站', '酥脆研究所', '圆面包俱乐部', '夜航汤粉', '米饭事务所', '半糖补给站',
  '云朵甜品屋', '深夜食堂', '椒香小馆', '街角热锅', '好胃口便当', '晚风茶铺',
];
const dishNames = ['招牌套餐', '经典单人餐', '香辣双拼', '清爽小份', '加量满足餐', '夜航特选', '脆香小食', '暖胃组合', '酸甜开胃餐', '浓香大份', '轻负担套餐', '好友分享餐', '今日限定'];

export const stores: StoreDetail[] = storeNames.map((name, storeIndex) => {
  const category = categories[storeIndex % categories.length];
  const id = `store-${String(storeIndex + 1).padStart(2, '0')}`;
  const menu: MenuItem[] = dishNames.map((dish, itemIndex) => ({
    id: `${id}-item-${String(itemIndex + 1).padStart(2, '0')}`,
    storeId: id,
    categoryId: category.id,
    name: `${name}${dish}`,
    subtitle: '原创虚拟菜单，仅用于互动演示',
    basePriceCents: 1200 + storeIndex * 30 + itemIndex * 120,
    sourceType: 'original',
    specGroups: [
      {
        id: `${id}-item-${itemIndex + 1}-size`,
        name: '份量',
        required: true,
        minSelect: 1,
        maxSelect: 1,
        options: [
          { id: `${id}-item-${itemIndex + 1}-regular`, name: '标准份', priceDeltaCents: 0, isDefault: true },
          { id: `${id}-item-${itemIndex + 1}-large`, name: '加大份', priceDeltaCents: 300 },
        ],
      },
      {
        id: `${id}-item-${itemIndex + 1}-taste`,
        name: '口味',
        required: false,
        minSelect: 0,
        maxSelect: 2,
        options: [
          { id: `${id}-item-${itemIndex + 1}-spicy`, name: '微辣', priceDeltaCents: 0 },
          { id: `${id}-item-${itemIndex + 1}-extra`, name: '加料', priceDeltaCents: 200 },
        ],
      },
    ],
  }));
  return {
    id,
    name,
    categoryId: category.id,
    description: '虚拟店铺 · 原创菜单 · 不会真实配送',
    tags: ['夜航推荐', '虚拟配送'],
    deliveryFeeCents: storeIndex % 4 === 0 ? 0 : 100 + (storeIndex % 3) * 100,
    packingFeeCents: 100,
    minimumOrderCents: 1000 + (storeIndex % 4) * 300,
    virtualDeliveryMinutes: 25 + (storeIndex % 6) * 4,
    monthlySales: 186 + (storeIndex * 173) % 1200,
    distanceKm: 0.8 + (storeIndex % 8) * 0.6,
    rating: 4.3 + (storeIndex % 7) * 0.1,
    systemHeat: 98 - storeIndex * 2,
    sourceType: 'original',
    menu,
  };
});
