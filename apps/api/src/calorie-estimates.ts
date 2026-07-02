import type { CalorieSource } from '@baichile/api-contract';
import type { SpecGroup } from '@baichile/domain';

const CHINA_NUTRITION_SOURCE: CalorieSource = {
  type: 'composition_estimate',
  description: '依据中国食物成分资料、菜名标示份量及常见成品份量估算',
  referenceUrl: 'https://nutrition.zju.edu.cn/',
};

const OFFICIAL_REFERENCE = 'https://www.mcdonalds.com.cn/';

const OFFICIAL_CALORIES: Record<string, number> = {
  '巨无霸': 503,
  '麦香鸡': 430,
  '麦辣鸡腿堡': 517,
  '麦乐鸡(10块)': 420,
  '中薯条': 337,
};

const CATEGORY_DEFAULTS: Record<string, number> = {
  bbq: 420,
  fried: 620,
  burger: 560,
  noodles: 650,
  rice: 680,
  tea: 320,
  dessert: 430,
  night: 520,
};

const KEYWORD_ESTIMATES: Array<[RegExp, number]> = [
  [/全家桶|整只炸鸡/, 1800],
  [/烤鱼/, 1250],
  [/披萨/, 900],
  [/套餐|双人|拼盘/, 850],
  [/炒饭|拌饭|盖饭|卤肉饭|黄焖|石锅/, 720],
  [/面|粉|米线|抄手|冒菜/, 650],
  [/汉堡|皇堡|堡|鸡肉卷|嫩牛五方/, 550],
  [/炸鸡|鸡排|手枪腿|原味鸡/, 650],
  [/鸡翅|烤翅/, 480],
  [/薯条|洋葱圈|鸡米花|酥肉/, 420],
  [/蛋糕|千层|提拉米苏|芝士|慕斯/, 480],
  [/冰淇淋|圣代|奶昔|暴风雪|麦旋风/, 360],
  [/奶茶|波波|珍珠|芋泥|乳茶|杨枝甘露/, 420],
  [/拿铁|澳瑞白|摩卡|生椰/, 260],
  [/美式|纯茶|铁观音|茉莉雪芽|绿妍|四季春/, 15],
  [/果茶|柠檬|鲜橙|葡萄|西瓜|百香果|蜜桃/, 220],
  [/羊肉串|牛肉串|五花|板筋|小腰|牛舌/, 520],
  [/生蚝|扇贝|花蛤|大虾|秋刀鱼/, 300],
  [/茄子|金针菇|娃娃菜|韭菜|黄瓜|木耳|毛豆|玉米/, 190],
  [/米饭/, 260],
  [/汤|豆浆|酸梅汤/, 160],
];

export function estimateCalories(
  name: string,
  categoryId: string,
): { caloriesKcal: number; calorieSource: CalorieSource } {
  const official = OFFICIAL_CALORIES[name];
  if (official) {
    return {
      caloriesKcal: official,
      calorieSource: {
        type: 'official',
        description: '采用品牌公开营养资料中的每份能量',
        referenceUrl: OFFICIAL_REFERENCE,
      },
    };
  }
  const matched = KEYWORD_ESTIMATES.find(([pattern]) => pattern.test(name));
  return {
    caloriesKcal: matched?.[1] ?? CATEGORY_DEFAULTS[categoryId] ?? 450,
    calorieSource: CHINA_NUTRITION_SOURCE,
  };
}

export function withCalorieDeltas(groups: SpecGroup[], baseCaloriesKcal: number): SpecGroup[] {
  return groups.map((group) => ({
    ...group,
    options: group.options.map((option) => {
      let calorieDeltaKcal = 0;
      if (/超大杯/.test(option.name)) calorieDeltaKcal = Math.round(baseCaloriesKcal * 0.8);
      else if (/大份|大杯/.test(option.name)) calorieDeltaKcal = Math.round(baseCaloriesKcal * 0.5);
      else if (/七分糖/.test(option.name)) calorieDeltaKcal = -30;
      else if (/半糖/.test(option.name)) calorieDeltaKcal = -60;
      else if (/不加糖/.test(option.name)) calorieDeltaKcal = -120;
      calorieDeltaKcal = Math.max(-baseCaloriesKcal, calorieDeltaKcal);
      return { ...option, calorieDeltaKcal };
    }),
  }));
}
