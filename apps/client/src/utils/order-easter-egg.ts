import type { VirtualOrder } from '@baichile/api-contract';
import { findDeliveryIncident, getDeliveryIncidentPhase } from '@baichile/domain';
import { staticAssetUrl } from '../config/static-cdn';
import { DELIVERY_START_MS } from './order-status';

export type OrderEggKind = 'collection' | 'incident';
export type OrderEggState = 'active' | 'revealed';

export interface OrderEggPresentation {
  id: string;
  kind: OrderEggKind;
  state: OrderEggState;
  eyebrow: string;
  title: string;
  description: string;
  meta: string;
  themeColor: string;
  imageUrl: string;
}

export const ORDER_EGG_IMAGE_BASE_URL = 'https://cloud1-d8g7o18ula3c12f10-1318253748.tcloudbaseapp.com/baichile-home/order-eggs';

export const ORDER_EGG_IMAGE_PATHS = {
  'incident-food_fights_back': 'incident-food-fights-back.webp',
  'incident-alien_abduction': 'incident-alien-abduction.webp',
  'incident-time_rift': 'incident-time-rift.webp',
  'incident-cat_requisition': 'incident-cat-requisition.webp',
  'incident-circus_recruitment': 'incident-circus-recruitment.webp',
  'incident-moon_navigation': 'incident-moon-navigation.webp',
  'incident-cloud_capture': 'incident-cloud-capture.webp',
  'incident-secret_food_society': 'incident-secret-food-society.webp',
  'collection-clean-plate': 'collection-clean-plate.webp',
  'collection-calorie-ninja': 'collection-calorie-ninja.webp',
  'collection-receipt-poet': 'collection-receipt-poet.webp',
  'collection-midnight-guard': 'collection-midnight-guard.webp',
  'collection-empty-feast': 'collection-empty-feast.webp',
  'collection-coupon-scholar': 'collection-coupon-scholar.webp',
  'collection-zero-bite': 'collection-zero-bite.webp',
  'collection-legend': 'collection-legend.webp',
} as const;

export function orderEggImageUrl(kind: OrderEggKind, id: string): string {
  const key = `${kind}-${id}` as keyof typeof ORDER_EGG_IMAGE_PATHS;
  const path = ORDER_EGG_IMAGE_PATHS[key];
  return path ? `${ORDER_EGG_IMAGE_BASE_URL}/${path}` : staticAssetUrl('share/order-cover.jpg');
}

/** Canvas in older Mini Program runtimes does not reliably render downloaded WebP files. */
export function orderEggPosterImageUrl(kind: OrderEggKind, id: string): string {
  const key = `${kind}-${id}` as keyof typeof ORDER_EGG_IMAGE_PATHS;
  const path = ORDER_EGG_IMAGE_PATHS[key];
  return path ? `${ORDER_EGG_IMAGE_BASE_URL}/${path.replace(/\.webp$/, '.jpg')}` : staticAssetUrl('share/order-cover.jpg');
}

const RARITY_LABELS = {
  common: '普通',
  rare: '稀有',
  legendary: '传说',
} as const;

export function createOrderEggPresentation(
  order: VirtualOrder,
  now = Date.now(),
): OrderEggPresentation | undefined {
  if (order.incident) {
    const phase = getDeliveryIncidentPhase(order.incident, now);
    if (phase === 'pending') return undefined;
    const definition = findDeliveryIncident(order.incident.key);
    if (phase === 'incident') {
      const remainingSeconds = Math.max(1, Math.ceil((Date.parse(order.incident.failedAt) - now) / 1000));
      return {
        id: `incident-${order.incident.key}`,
        kind: 'incident',
        state: 'active',
        eyebrow: '发现配送彩蛋',
        title: definition.activeText,
        description: `这不是普通延误，结局将在 ${remainingSeconds} 秒后揭晓。`,
        meta: '配送彩蛋 · 进行中',
        themeColor: '#F04B32',
        imageUrl: orderEggImageUrl('incident', order.incident.key),
      };
    }
    return {
      id: `incident-${order.incident.key}`,
      kind: 'incident',
      state: 'revealed',
      eyebrow: '配送彩蛋结局揭晓',
      title: definition.failedText,
      description: order.refundStatus === 'refunded'
        ? '本单虚拟饭钱已原路退回。'
        : '本单配送失败，虚拟饭钱正在原路退回。',
      meta: `配送彩蛋 · ${order.refundStatus === 'refunded' ? '已退款' : '退款处理中'}`,
      themeColor: '#F04B32',
      imageUrl: orderEggImageUrl('incident', order.incident.key),
    };
  }

  const completedAt = Date.parse(order.startedAt) + DELIVERY_START_MS + order.durationMs;
  if (now < completedAt || !order.easterEgg) return undefined;
  const rarity = RARITY_LABELS[order.easterEgg.rarity];
  return {
    id: order.easterEgg.id,
    kind: 'collection',
    state: 'revealed',
    eyebrow: `发现${rarity}彩蛋`,
    title: order.easterEgg.name,
    description: order.easterEgg.verdict,
    meta: `${rarity}收藏 · #${order.easterEgg.collectionNumber}`,
    themeColor: order.easterEgg.themeColor,
    imageUrl: orderEggImageUrl('collection', order.easterEgg.id),
  };
}

export function orderEggRevealKey(orderId: string, eggId: string): string {
  return `order-egg-reveal:${orderId}:${eggId}`;
}

export function hasSeenOrderEgg(orderId: string, eggId: string): boolean {
  return Boolean(uni.getStorageSync(orderEggRevealKey(orderId, eggId)));
}

export function markOrderEggSeen(orderId: string, eggId: string): void {
  uni.setStorageSync(orderEggRevealKey(orderId, eggId), true);
}
