const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DATA_URL = 'https://www.choutuan.cloudwaveai.cn/js/data.js';
const IMAGE_BASE_URL = 'https://www.choutuan.cloudwaveai.cn/img';
const SOURCE_REFERENCE_URL = DATA_URL;

const CATEGORY_ID_MAP = {
  burger: 'ct-burger',
  pizza: 'ct-pizza',
  coffee: 'ct-coffee',
  drink: 'ct-drink',
  dessert: 'ct-dessert',
  brunch: 'ct-brunch',
  hotpot: 'ct-hotpot',
  bbq: 'ct-bbq',
  breakfast: 'ct-breakfast',
  noodle: 'ct-noodle',
  rice: 'ct-rice',
  western: 'ct-western',
  fruit: 'ct-fruit',
};

const CATEGORY_ICON_MAP = {
  burger: 'burger',
  pizza: 'burger',
  coffee: 'milkTea',
  drink: 'milkTea',
  dessert: 'dessert',
  brunch: 'rice',
  hotpot: 'lateNight',
  bbq: 'bbq',
  breakfast: 'rice',
  noodle: 'noodles',
  rice: 'rice',
  western: 'burger',
  fruit: 'dessert',
};

const CATEGORY_ESTIMATE_MAP = {
  burger: 'burger',
  pizza: 'western',
  coffee: 'coffee',
  drink: 'tea',
  dessert: 'dessert',
  brunch: 'healthy',
  hotpot: 'night',
  bbq: 'bbq',
  breakfast: 'rice',
  noodle: 'noodles',
  rice: 'rice',
  western: 'western',
  fruit: 'dessert',
};

const STORE_NAME_MAP = {
  '麦当当': '麦当隆',
  '啃德鸡': '啃得鸡',
  '汉堡堡王': '汉堡旺',
  '华莱莱士': '华莱仕',
  '德克士士': '德克仕',
  '塔斯汀汀': '塔斯町',
  '必胜胜客': '必盛客',
  '达美乐乐': '达美勒',
  '萨莉亚亚': '萨莉雅',
  '意面达文西西': '意面达文希',
  '星巴巴克': '星巴客',
  '瑞幸幸咖啡': '瑞幸咖坊',
  '库迪迪咖啡': '库迪咖坊',
  '蜜雪冰冰城': '蜜雪冰橙',
  '喜茶茶': '喜茗',
  '奈雪的茶茶': '奈雪茶',
  '茶颜悦色色': '茶颜悦茗',
  '一点点点': '壹点',
  '好利来来': '好利徕',
  '甜过初恋恋': '甜过初见',
  'DQ冰雪皇后后': 'DQ冰雪皇庭',
  '海底捞捞': '海底涮',
  '木屋烧烤烤': '木屋烤局',
  '沙县小小吃': '沙县小吃家',
  '老乡鸡鸡': '老乡吉',
  '西堤牛牛排': '西堤牛排',
  '板前寿寿司': '板前寿司',
  '杨铭羽黄焖鸡': '杨铭羽黄焖吉',
};

async function main() {
  const data = await fetchCatalogData();
  const categories = buildCategories(data.CATEGORIES);
  const stores = buildStores(data.SHOPS);
  const availableFiles = await downloadImages(stores);
  const finalizedStores = finalizeStores(stores, availableFiles);

  writeCatalogFile(categories, finalizedStores);

  console.log(`Refreshed choutuan catalog: ${categories.length} categories, ${finalizedStores.length} stores`);
}

async function fetchCatalogData() {
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${DATA_URL}: ${response.status}`);
  }
  const source = await response.text();
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.__CT_DATA__ = CT_DATA;`, context);
  return context.__CT_DATA__;
}

function buildCategories(categories) {
  return categories
    .filter((category) => category.id !== 'all' && CATEGORY_ID_MAP[category.id])
    .map((category) => ({
      id: CATEGORY_ID_MAP[category.id],
      name: category.name,
      icon: CATEGORY_ICON_MAP[category.id] || 'burger',
    }));
}

function buildStores(shops) {
  return shops.map((shop) => {
    const subCategoryMap = new Map();
    const menu = shop.products.map((product, index) => {
      if (!subCategoryMap.has(product.cat)) {
        subCategoryMap.set(product.cat, `section-${String(subCategoryMap.size + 1).padStart(2, '0')}`);
      }
      const estimateCategoryId = CATEGORY_ESTIMATE_MAP[shop.category] || 'burger';
      const calorieEstimate = estimateCalories(product.name, estimateCategoryId);
      return {
        id: `choutuan-${product.id}`,
        storeId: `choutuan-${shop.id}`,
        categoryId: CATEGORY_ID_MAP[shop.category],
        subCategoryId: subCategoryMap.get(product.cat),
        name: product.name,
        subtitle: product.desc || undefined,
        imageUrl: `/static/choutuan-img/${product.photo}.webp`,
        __imageKey: `${product.photo}.webp`,
        basePriceCents: yuan(product.price),
        caloriesKcal: calorieEstimate.caloriesKcal,
        calorieSource: calorieEstimate.calorieSource,
        monthlySales: product.sales,
        specGroups: [],
        sourceType: 'derived',
      };
    });

    return {
      id: `choutuan-${shop.id}`,
      name: transformStoreName(shop.name),
      categoryId: CATEGORY_ID_MAP[shop.category],
      description: shop.notice,
      coverUrl: `/static/choutuan-img/${shop.photo}.webp`,
      __coverKey: `${shop.photo}.webp`,
      tags: shop.promos || [],
      deliveryFeeCents: yuan(shop.deliveryFee),
      packingFeeCents: 200,
      minimumOrderCents: yuan(shop.minOrder),
      virtualDeliveryMinutes: shop.deliveryMin,
      monthlySales: shop.monthlySales,
      distanceKm: shop.distanceKm,
      rating: shop.rating,
      recentViewers: Math.max(80, Math.round(shop.monthlySales * 0.04)),
      systemHeat: Math.min(99, Math.max(60, Math.round(shop.rating * 18 + Math.log10(shop.monthlySales + 1) * 8))),
      sourceType: 'derived',
      subCategories: [...subCategoryMap.entries()].map(([name, id]) => ({ id, name })),
      menu,
    };
  });
}

function transformStoreName(name) {
  if (STORE_NAME_MAP[name]) return STORE_NAME_MAP[name];
  return name.replace(/(.)\1+/g, '$1');
}

function yuan(value) {
  return Math.round(Number(value) * 100);
}

function estimateCalories(name, categoryId) {
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
    caloriesKcal: matched ? matched[1] : (CATEGORY_DEFAULTS[categoryId] || 450),
    calorieSource: CHINA_NUTRITION_SOURCE,
  };
}

async function downloadImages(stores) {
  const fileNames = new Set();
  for (const store of stores) {
    if (store.__coverKey) fileNames.add(store.__coverKey);
    for (const item of store.menu) {
      if (item.__imageKey) fileNames.add(item.__imageKey);
    }
  }

  for (const targetDir of imageTargetDirs()) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const availableFiles = new Set();
  const missingFiles = [];
  for (const fileName of [...fileNames].sort()) {
    const buffer = await downloadBuffer(`${IMAGE_BASE_URL}/${fileName}`);
    if (!buffer) {
      missingFiles.push(fileName);
      continue;
    }
    for (const targetDir of imageTargetDirs()) {
      fs.writeFileSync(path.join(targetDir, fileName), buffer);
    }
    availableFiles.add(fileName);
  }
  if (missingFiles.length) {
    console.warn(`Missing source images: ${missingFiles.length}`);
  }
  return availableFiles;
}

function imageTargetDirs() {
  const root = path.resolve(__dirname, '../../..');
  return [
    path.join(root, 'apps/client/src/static/choutuan-img'),
    path.join(root, 'apps/client/static/choutuan-img'),
  ];
}

async function downloadBuffer(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) return null;
  const bytes = await response.arrayBuffer();
  return Buffer.from(bytes);
}

function finalizeStores(stores, availableFiles) {
  return stores.map((store) => {
    const fallbackStoreFile = pickFirstAvailable([
      store.__coverKey,
      ...store.menu.map((item) => item.__imageKey),
      'bg1.webp',
    ], availableFiles);
    return {
      ...stripPrivate(store),
      coverUrl: fallbackStoreFile ? `/static/choutuan-img/${fallbackStoreFile}` : undefined,
      menu: store.menu.map((item) => {
        const fileName = pickFirstAvailable([
          item.__imageKey,
          store.__coverKey,
          fallbackStoreFile,
          'bg1.webp',
        ], availableFiles);
        return {
          ...stripPrivate(item),
          imageUrl: fileName ? `/static/choutuan-img/${fileName}` : undefined,
        };
      }),
    };
  });
}

function pickFirstAvailable(candidates, availableFiles) {
  for (const candidate of candidates) {
    if (candidate && availableFiles.has(candidate)) return candidate;
  }
  return null;
}

function stripPrivate(record) {
  const { __coverKey, __imageKey, ...rest } = record;
  return rest;
}

function writeCatalogFile(categories, stores) {
  const output = `import type { Category, StoreDetail } from '@baichile/api-contract';

/*
 * Derived from the public static catalog at ${SOURCE_REFERENCE_URL}
 * Snapshot contains ${stores.length} stores and ${stores.reduce((sum, store) => sum + store.menu.length, 0)} menu items.
 */

export const choutuanCategories: Category[] = ${JSON.stringify(categories, null, 2)};

export const choutuanStores: StoreDetail[] = ${JSON.stringify(stores, null, 2)};
`;

  const target = path.resolve(__dirname, '../src/catalog.choutuan.ts');
  fs.writeFileSync(target, output);
}

const CHINA_NUTRITION_SOURCE = {
  type: 'composition_estimate',
  description: '依据中国食物成分资料、菜名标示份量及常见成品份量估算',
  referenceUrl: 'https://nutrition.zju.edu.cn/',
};

const OFFICIAL_REFERENCE = 'https://www.mcdonalds.com.cn/';

const OFFICIAL_CALORIES = {
  '巨无霸': 503,
  '麦香鸡': 430,
  '麦辣鸡腿堡': 517,
  '麦乐鸡(10块)': 420,
  '中薯条': 337,
};

const CATEGORY_DEFAULTS = {
  bbq: 420,
  fried: 620,
  burger: 560,
  noodles: 650,
  rice: 680,
  tea: 320,
  dessert: 430,
  night: 520,
  western: 560,
  coffee: 180,
  healthy: 420,
};

const KEYWORD_ESTIMATES = [
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
