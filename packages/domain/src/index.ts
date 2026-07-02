export interface SpecOption {
  id: string;
  name: string;
  priceDeltaCents: number;
  calorieDeltaKcal: number;
  isDefault?: boolean;
}

export interface SpecGroup {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: SpecOption[];
}

export function calculateLineTotal(
  basePriceCents: number,
  optionPriceDeltas: number[],
  quantity: number,
): number {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('商品数量必须是正整数');
  return (basePriceCents + optionPriceDeltas.reduce((sum, price) => sum + price, 0)) * quantity;
}

export function calculateOrderTotal(
  lineTotals: number[],
  deliveryFeeCents: number,
  packingFeeCents: number,
): number {
  return lineTotals.reduce((sum, total) => sum + total, 0) + deliveryFeeCents + packingFeeCents;
}

export function calculateLineCalories(
  baseCaloriesKcal: number,
  optionCalorieDeltas: number[],
  quantity: number,
): number {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('商品数量必须是正整数');
  const unitCalories = baseCaloriesKcal
    + optionCalorieDeltas.reduce((sum, calories) => sum + calories, 0);
  if (unitCalories < 0) throw new Error('卡路里不能小于 0');
  return unitCalories * quantity;
}

export function validateSelections(
  groups: SpecGroup[],
  optionIds: string[],
): { valid: true } | { valid: false; message: string } {
  const selected = new Set(optionIds);
  for (const group of groups) {
    const count = group.options.filter((option) => selected.has(option.id)).length;
    if (count < group.minSelect || (group.required && count === 0)) {
      return { valid: false, message: `请选择${group.name}` };
    }
    if (count > group.maxSelect) return { valid: false, message: `${group.name}最多选择${group.maxSelect}项` };
  }
  return { valid: true };
}

export const DELIVERY_INCIDENTS = [
  { key: 'food_fights_back', activeText: '你的骑手正在攻击你的外卖', failedText: '外卖成功反击并逃离，配送失败' },
  { key: 'alien_abduction', activeText: '骑手遭遇了外星人袭击', failedText: '您的外卖已抵达火星，配送失败' },
  { key: 'time_rift', activeText: '骑手误入了时空裂缝', failedText: '外卖正在另一个时代冒险，配送失败' },
  { key: 'cat_requisition', activeText: '猫猫星球正在征用你的外卖', failedText: '征用手续已完成，配送失败' },
  { key: 'circus_recruitment', activeText: '你的外卖正在参加马戏团面试', failedText: '外卖决定加入流浪马戏团，配送失败' },
  { key: 'moon_navigation', activeText: '骑手导航突然改道月球', failedText: '本单已进入绕月轨道，配送失败' },
  { key: 'cloud_capture', activeText: '一朵云正在劫持你的外卖', failedText: '外卖已随云远行，配送失败' },
  { key: 'secret_food_society', activeText: '神秘美食组织拦下了骑手', failedText: '外卖已加入神秘美食组织，配送失败' },
] as const;

export type DeliveryIncidentKey = typeof DELIVERY_INCIDENTS[number]['key'];
export type DeliveryIncidentPhase = 'pending' | 'incident' | 'failed';

export interface DeliveryIncidentAssignment {
  key: DeliveryIncidentKey;
  startedAt: string;
  failedAt: string;
}

export function stableHash(value: string): number {
  return value.split('').reduce((hash, character) => (
    ((hash << 5) - hash + character.charCodeAt(0)) | 0
  ), 0) >>> 0;
}

export function selectDeliveryIncident(
  seed: string,
  _deliveryDurationMinutes: number,
  orderStartedAt = Date.now(),
): DeliveryIncidentAssignment | undefined {
  const hash = stableHash(seed);
  if (hash % 10 >= 3) return undefined;
  const startedAt = orderStartedAt + 30_000;
  return {
    key: DELIVERY_INCIDENTS[Math.floor(hash / 10) % DELIVERY_INCIDENTS.length].key,
    startedAt: new Date(startedAt).toISOString(),
    failedAt: new Date(startedAt + 15_000).toISOString(),
  };
}

export function getDeliveryIncidentPhase(
  assignment: DeliveryIncidentAssignment,
  now = Date.now(),
): DeliveryIncidentPhase {
  if (now >= Date.parse(assignment.failedAt)) return 'failed';
  if (now >= Date.parse(assignment.startedAt)) return 'incident';
  return 'pending';
}

export function findDeliveryIncident(key: DeliveryIncidentKey) {
  return DELIVERY_INCIDENTS.find((incident) => incident.key === key)!;
}
