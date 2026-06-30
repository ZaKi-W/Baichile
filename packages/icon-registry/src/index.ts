export type IconKey =
  | 'home' | 'orders' | 'profile' | 'search' | 'location' | 'back' | 'close'
  | 'cart' | 'plus' | 'minus' | 'rider' | 'route' | 'clock' | 'success'
  | 'empty' | 'error' | 'bbq' | 'friedChicken' | 'burger' | 'noodles'
  | 'rice' | 'milkTea' | 'dessert' | 'lateNight';

export interface IconDefinition {
  emoji: string;
  label: string;
  assetPath?: string;
}

export const ICON_REGISTRY: Record<IconKey, IconDefinition> = {
  home: { emoji: '🏠', label: '首页' },
  orders: { emoji: '📋', label: '订单' },
  profile: { emoji: '👤', label: '我的' },
  search: { emoji: '🔎', label: '搜索' },
  location: { emoji: '📍', label: '位置' },
  back: { emoji: '‹', label: '返回' },
  close: { emoji: '✕', label: '关闭' },
  cart: { emoji: '🛒', label: '购物车' },
  plus: { emoji: '＋', label: '增加' },
  minus: { emoji: '－', label: '减少' },
  rider: { emoji: '🛵', label: '虚拟骑手' },
  route: { emoji: '🗺️', label: '虚拟路线' },
  clock: { emoji: '🕒', label: '时间' },
  success: { emoji: '✨', label: '完成' },
  empty: { emoji: '🍽️', label: '暂无内容' },
  error: { emoji: '⚠️', label: '异常' },
  bbq: { emoji: '🍢', label: '烧烤' },
  friedChicken: { emoji: '🍗', label: '炸鸡' },
  burger: { emoji: '🍔', label: '汉堡' },
  noodles: { emoji: '🍜', label: '粉面' },
  rice: { emoji: '🍛', label: '盖饭' },
  milkTea: { emoji: '🧋', label: '奶茶' },
  dessert: { emoji: '🍰', label: '甜品' },
  lateNight: { emoji: '🌙', label: '夜宵' },
};

