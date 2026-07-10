import type { VirtualOrder } from '@baichile/api-contract';
import { findDeliveryIncident, getDeliveryIncidentPhase } from '@baichile/domain';
import { DELIVERY_START_MS, getOrderStep, getOrderStepIndex, ORDER_STEPS } from './order-status';

const ORDER_PREPARATION_MS = DELIVERY_START_MS;

export interface HomeOrderSummary {
  order: VirtualOrder;
  statusLabel: string;
  remainingMs: number;
  terminal: boolean;
  incidentText: string;
  refundLabel: string;
  progress: number;
  itemText: string;
}

export function createHomeOrderSummary(order: VirtualOrder, now = Date.now()): HomeOrderSummary {
  const startedAt = Date.parse(order.startedAt);
  const completionAt = startedAt + ORDER_PREPARATION_MS + order.durationMs;
  const incidentPhase = order.incident ? getDeliveryIncidentPhase(order.incident, now) : 'pending';
  const incident = order.incident ? findDeliveryIncident(order.incident.key) : undefined;

  let statusLabel = getOrderStep(startedAt, order.durationMs, now).listLabel
    || getOrderStep(startedAt, order.durationMs, now).label;
  let remainingMs = Math.max(0, completionAt - now);
  let terminal = now >= completionAt;
  let incidentText = '';
  let refundLabel = '';
  let progress = Math.min(1, Math.max(0, (now - startedAt) / (completionAt - startedAt)));

  if (incidentPhase === 'incident' && order.incident) {
    statusLabel = '突发事件';
    remainingMs = Math.max(0, Date.parse(order.incident.failedAt) - now);
    terminal = false;
    incidentText = incident?.activeText || '';
    const incidentDuration = Date.parse(order.incident.failedAt) - Date.parse(order.incident.startedAt);
    progress = incidentDuration > 0
      ? Math.min(1, Math.max(0, (now - Date.parse(order.incident.startedAt)) / incidentDuration))
      : 0;
  } else if (incidentPhase === 'failed') {
    statusLabel = '配送失败';
    remainingMs = 0;
    terminal = true;
    incidentText = incident?.failedText || '';
    refundLabel = order.refundStatus === 'refunded' ? '已退款' : '退款处理中';
    progress = 1;
  } else if (terminal) {
    statusLabel = '已完成';
    progress = 1;
  } else {
    progress = getOrderStepIndex(startedAt, order.durationMs, now) / (ORDER_STEPS.length - 1);
  }

  const itemText = order.lines.slice(0, 2)
    .map((line) => `${line.name}${line.quantity > 1 ? ` ×${line.quantity}` : ''}`)
    .join('、') + (order.lines.length > 2 ? ` 等${order.lines.length}件` : '');

  return { order, statusLabel, remainingMs, terminal, incidentText, refundLabel, progress, itemText };
}

export function formatOrderRemaining(remainingMs: number): string {
  if (remainingMs <= 0) return '已结束';
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}分${String(seconds).padStart(2, '0')}秒` : `${seconds}秒`;
}

export function createVisibleHomeOrderSummaries(
  orders: VirtualOrder[],
  now: number,
  visibleOrderIds: string[],
): HomeOrderSummary[] {
  return orders
    .map((order) => createHomeOrderSummary(order, now))
    .filter((summary) => visibleOrderIds.includes(summary.order.id))
    .sort((a, b) => Date.parse(b.order.startedAt) - Date.parse(a.order.startedAt));
}

export function homeOrderSeenKey(accountId: string): string {
  return `baichile:home-order-dismissed:${accountId}`;
}
