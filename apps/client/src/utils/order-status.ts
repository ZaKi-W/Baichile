export interface OrderStep {
  key: string;
  label: string;
  listLabel?: string;
  statusText: string;
}

export const ORDER_STEPS: OrderStep[] = [
  { key: 'created', label: '已下单', statusText: '订单已提交' },
  { key: 'merchant_accepted', label: '商家接单', statusText: '商家已接单' },
  { key: 'preparing', label: '备餐中', statusText: '商家正在备餐' },
  { key: 'rider_assigned', label: '骑手接单', statusText: '骑手已接单，正在前往商家' },
  { key: 'picked_up', label: '已取餐', statusText: '骑手已取餐，正在前往目的地' },
  { key: 'delivering', label: '配送中', statusText: '骑手正在前往目的地' },
  { key: 'completed', label: '已送达', listLabel: '已完成', statusText: '订单已完成' },
];

const STEP_TIMES = [0, 3_000, 8_000, 18_000, 78_000, 83_000];
const DELIVERY_START_MS = STEP_TIMES.at(-1)!;

export function getOrderStepIndex(startedAt: number, deliveryDurationMs: number, now = Date.now()): number {
  const elapsed = now - startedAt;
  if (elapsed >= DELIVERY_START_MS + deliveryDurationMs) return ORDER_STEPS.length - 1;
  for (let index = STEP_TIMES.length - 1; index >= 0; index -= 1) {
    if (elapsed >= STEP_TIMES[index]) return index;
  }
  return 0;
}

export function getOrderStep(startedAt: number, deliveryDurationMs: number, now = Date.now()): OrderStep {
  return ORDER_STEPS[getOrderStepIndex(startedAt, deliveryDurationMs, now)];
}
