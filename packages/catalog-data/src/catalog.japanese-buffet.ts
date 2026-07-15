import type { StoreDetail } from '@baichile/api-contract';
import { estimateCalories } from './calorie-estimates';

const STORE_ID = 'japanese-buffet-sakura';

/*
 * Menu names, categories, and images were extracted from the public menu at
 * https://www.tangshanzhenxuan.com/Product.aspx-2.html?CateID=92
 * together with the four sibling menu categories linked from that page.
 */
const items = [
  ['三文鱼片', '刺身', 'sashimi'],
  ['生食牛肉', '刺身', 'sashimi'],
  ['北极贝刺身', '刺身', 'sashimi'],
  ['季节鱼生双拼', '刺身', 'sashimi'],
  ['大渔金牌生蚝', '特色扒类', 'teppanyaki'],
  ['大渔金牌扇贝', '特色扒类', 'teppanyaki'],
  ['秘制大虾', '特色扒类', 'teppanyaki'],
  ['泰式黑虎虾', '特色扒类', 'teppanyaki'],
  ['香煎多春鱼', '特色扒类', 'teppanyaki'],
  ['大渔菲力牛排', '特色扒类', 'teppanyaki'],
  ['干煎鳕鱼', '特色扒类', 'teppanyaki'],
  ['美式三支骨牛小排', '特色扒类', 'teppanyaki'],
  ['金针菇牛肉卷', '特色扒类', 'teppanyaki'],
  ['法式羊排', '特色扒类', 'teppanyaki'],
  ['吊烧鱿鱼圈', '特色扒类', 'teppanyaki'],
  ['心心相印', '特色扒类', 'teppanyaki'],
  ['菲力牛排', '特色扒类', 'teppanyaki'],
  ['北欧青花鱼', '特色扒类', 'teppanyaki'],
  ['大渔特色拉面', '主食', 'staple'],
  ['经典牛肉炒饭', '主食', 'staple'],
  ['海鲜炒乌冬', '主食', 'staple'],
  ['八爪鱼寿司', '寿司', 'sushi'],
  ['芒果卷', '寿司', 'sushi'],
  ['芒果扇贝王寿司', '寿司', 'sushi'],
  ['三文鱼卷', '寿司', 'sushi'],
  ['北海道亲子寿司', '寿司', 'sushi'],
  ['加州卷', '寿司', 'sushi'],
] as const;

export const japaneseBuffetStore: StoreDetail = {
  id: STORE_ID,
  name: '樱川日料自助',
  categoryId: 'ct-western',
  description: '日料自助菜单，菜品均包含在自助餐内。',
  coverUrl: '/static/japanese-buffet-img/jb-01.jpg',
  tags: ['日料自助', '刺身寿司', '铁板烧'],
  deliveryFeeCents: 0,
  packingFeeCents: 0,
  minimumOrderCents: 0,
  virtualDeliveryMinutes: 30,
  monthlySales: 0,
  distanceKm: 1.6,
  rating: 4.7,
  recentViewers: 168,
  systemHeat: 92,
  sourceType: 'derived',
  subCategories: [
    { id: 'sashimi', name: '刺身' },
    { id: 'teppanyaki', name: '特色扒类' },
    { id: 'sushi', name: '寿司' },
    { id: 'staple', name: '主食' },
  ],
  menu: items.map(([name, subtitle, subCategoryId], index) => {
    const calories = estimateCalories(name, 'japanese');
    const itemNumber = String(index + 1).padStart(2, '0');
    return {
      id: `${STORE_ID}-item-${itemNumber}`,
      storeId: STORE_ID,
      categoryId: 'ct-western',
      subCategoryId,
      name,
      subtitle,
      imageUrl: `/static/japanese-buffet-img/jb-${itemNumber}.jpg`,
      // The source menu has no a-la-carte prices; dishes are included in the buffet.
      basePriceCents: 0,
      ...calories,
      monthlySales: 0,
      specGroups: [],
      sourceType: 'derived' as const,
    };
  }),
};
