import type { Category, StoreDetail } from '@baichile/api-contract';

export const mockCategories: Category[] = [
  ['bbq', '烧烤', 'bbq'], ['fried', '炸鸡', 'friedChicken'], ['burger', '汉堡', 'burger'],
  ['noodles', '粉面', 'noodles'], ['rice', '盖饭', 'rice'], ['tea', '奶茶', 'milkTea'],
  ['dessert', '甜品', 'dessert'], ['night', '夜宵', 'lateNight'],
].map(([id, name, icon]) => ({ id, name, icon }));

const names = ['炭火小站', '酥脆研究所', '圆面包俱乐部', '夜航汤粉', '米饭事务所', '半糖补给站', '云朵甜品屋', '深夜食堂', '椒香小馆', '街角热锅', '好胃口便当', '晚风茶铺'];
const dishes = ['招牌套餐', '经典单人餐', '香辣双拼', '清爽小份', '加量满足餐', '夜航特选', '脆香小食', '暖胃组合', '酸甜开胃餐', '浓香大份', '轻负担套餐', '好友分享餐', '今日限定'];

export const mockStores: StoreDetail[] = names.map((name, index) => {
  const id = `store-${String(index + 1).padStart(2, '0')}`;
  const category = mockCategories[index % mockCategories.length];
  return {
    id, name, categoryId: category.id, description: '虚拟店铺 · 不会真实配送',
    tags: ['堂食店', '热情掌柜'],
    deliveryFeeCents: index % 4 === 0 ? 0 : 100 + (index % 3) * 100,
    packingFeeCents: 100,
    minimumOrderCents: 1000 + (index % 4) * 300,
    virtualDeliveryMinutes: 25 + (index % 6) * 4,
    monthlySales: 186 + (index * 173) % 1200,
    distanceKm: 0.8 + (index % 8) * 0.6,
    rating: 4.3 + (index % 7) * 0.1,
    recentViewers: 86 + (index * 127) % 900,
    systemHeat: 98 - index * 2,
    sourceType: 'original',
    menu: dishes.map((dish, itemIndex) => ({
      id: `${id}-item-${itemIndex + 1}`, storeId: id, categoryId: category.id,
      name: `${name}${dish}`, subtitle: '原创虚拟菜单', basePriceCents: 1200 + itemIndex * 120,
      sourceType: 'original',
      specGroups: [{
        id: `${id}-${itemIndex}-size`, name: '份量', required: true, minSelect: 1, maxSelect: 1,
        options: [
          { id: `${id}-${itemIndex}-regular`, name: '标准份', priceDeltaCents: 0, isDefault: true },
          { id: `${id}-${itemIndex}-large`, name: '加大份', priceDeltaCents: 300 },
        ],
      }, {
        id: `${id}-${itemIndex}-taste`, name: '口味与加料', required: false, minSelect: 0, maxSelect: 2,
        options: [
          { id: `${id}-${itemIndex}-spicy`, name: '微辣', priceDeltaCents: 0 },
          { id: `${id}-${itemIndex}-extra`, name: '加料', priceDeltaCents: 200 },
        ],
      }],
    })),
  };
});
