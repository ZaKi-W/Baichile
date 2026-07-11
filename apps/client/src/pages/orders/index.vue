<script setup lang="ts">
import { ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import { useAuthStore } from '../../stores/auth';
import { useOrderStore } from '../../stores/orders';
import { catalogService } from '../../services/catalog';
import { getOrderStep } from '../../utils/order-status';
import { findDeliveryIncident, getDeliveryIncidentPhase } from '@baichile/domain';
import type { VirtualOrder } from '@baichile/api-contract';
const auth = useAuthStore();
const orders = useOrderStore();
const now = ref(Date.now());
const storeCovers = ref<Record<string, string>>({});
let statusTimer: ReturnType<typeof setInterval> | undefined;
const openOrder = (id: string) => uni.navigateTo({ url: `/pages/delivery/index?id=${id}` });
const openStore = (storeId: string) => uni.navigateTo({ url: `/pages/store/index?id=${storeId}` });
const openLogin = () => uni.switchTab({ url: '/pages/profile/index' });
const statusLabel = (order: VirtualOrder) => {
  if (order.incident) {
    const phase = getDeliveryIncidentPhase(order.incident, now.value);
    if (phase === 'failed') return '配送失败';
    if (phase === 'incident') return '突发事件';
  }
  const step = getOrderStep(new Date(order.startedAt).getTime(), order.durationMs, now.value);
  return step.listLabel || step.label;
};
const incidentText = (order: VirtualOrder) => {
  if (!order.incident) return '';
  const phase = getDeliveryIncidentPhase(order.incident, now.value);
  if (phase === 'pending') return '';
  const incident = findDeliveryIncident(order.incident.key);
  return phase === 'failed' ? incident.failedText : incident.activeText;
};
const isCompleted = (startedAt: string, durationMs: number) =>
  getOrderStep(new Date(startedAt).getTime(), durationMs, now.value).key === 'completed';
const isFailed = (order: VirtualOrder) =>
  order.status === 'failed' || Boolean(order.incident && getDeliveryIncidentPhase(order.incident, now.value) === 'failed');
const storeName = (order: VirtualOrder) => order.storeName || '白吃了订单';
const storeThumb = (order: VirtualOrder) => storeCovers.value[order.storeId] || '';
async function loadStoreCovers() {
  try {
    const home = await catalogService.home();
    storeCovers.value = Object.fromEntries(
      [...home.featured, ...home.stores]
        .filter((store) => Boolean(store.coverUrl))
        .map((store) => [store.id, store.coverUrl as string]),
    );
  } catch {
    storeCovers.value = {};
  }
}
const dishSummary = (order: VirtualOrder) => order.lines
  .map((line) => `${line.name}${line.optionNames.length ? `（${line.optionNames.join('、')}）` : ''} ×${line.quantity}`)
  .join('、');
const itemCount = (order: VirtualOrder) => order.lines.reduce((sum, line) => sum + line.quantity, 0);
const formatMoney = (cents: number) => `¥${(cents / 100).toFixed(2)}`;
const formatOrderTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
onShow(() => {
  now.value = Date.now();
  void orders.load();
  void loadStoreCovers();
  clearInterval(statusTimer);
  statusTimer = setInterval(() => { now.value = Date.now(); }, 1000);
});
onHide(() => clearInterval(statusTimer));
</script>

<template>
  <view class="page">
    <view v-if="!auth.accountId" class="card muted">
      <text>登录后查看你的订单</text>
      <button class="primary-button login-button" @tap="openLogin">去登录</button>
    </view>
    <view v-for="order in auth.accountId ? orders.orders : []" :key="order.id" class="order-card">
      <view class="order-main" @tap="openOrder(order.id)">
        <view class="order-top">
          <view class="store-block">
            <image v-if="storeThumb(order)" class="store-thumb" :src="storeThumb(order)" mode="aspectFill" />
            <view v-else class="store-thumb thumb-fallback">
              <text>{{ storeName(order).slice(0, 1) }}</text>
            </view>
            <text class="store-name">{{ storeName(order) }}</text>
          </view>
          <text class="status-text" :class="{ failed: isFailed(order), completed: isCompleted(order.startedAt, order.durationMs) }">
            {{ statusLabel(order) }}
          </text>
        </view>
        <text class="dish-summary">{{ dishSummary(order) }}</text>
        <view class="order-meta">
          <text>{{ formatOrderTime(order.createdAt || order.startedAt) }}</text>
          <text>· 共{{ itemCount(order) }}件</text>
          <text>· 实付 </text>
          <text class="paid-money">{{ formatMoney(order.totalCents) }}</text>
        </view>
        <text v-if="incidentText(order)" class="incident-story">{{ incidentText(order) }}</text>
      </view>
      <view class="order-actions">
        <button v-if="!isFailed(order) && !isCompleted(order.startedAt, order.durationMs)" class="action-button primary-action" @tap.stop="openOrder(order.id)">查看配送</button>
        <button v-else-if="isCompleted(order.startedAt, order.durationMs)" class="action-button primary-action" @tap.stop="openOrder(order.id)">确认收货</button>
        <button class="action-button ghost-action" @tap.stop="openStore(order.storeId)">再来一单</button>
        <button class="action-button ghost-action" @tap.stop="openOrder(order.id)">订单详情</button>
      </view>
    </view>
    <view v-if="auth.accountId && !orders.orders.length" class="card muted">还没有虚拟订单，先去首页逛逛吧。</view>
    <view class="tab-spacer" />
  </view>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx 24rpx 0;
  box-sizing: border-box;
  background: #f6f6f6;
}
.order-card {
  margin-bottom: 22rpx;
  overflow: hidden;
  border: 1rpx solid #ececec;
  border-radius: 24rpx;
  background: #fff;
}
.order-main {
  padding: 26rpx 24rpx 22rpx;
}
.order-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 22rpx;
}
.store-block {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.store-thumb {
  width: 56rpx;
  height: 56rpx;
  flex-shrink: 0;
  border-radius: 12rpx;
  background: #ececea;
}
.thumb-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #777;
  font-size: 22rpx;
  font-weight: 800;
}
.store-name {
  min-width: 0;
  color: #1f1f1f;
  font-size: 30rpx;
  font-weight: 900;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-text {
  flex-shrink: 0;
  color: #f04426;
  font-size: 25rpx;
  font-weight: 800;
}
.status-text.completed {
  color: #259b58;
}
.status-text.failed {
  color: #999;
}
.dish-summary {
  display: block;
  margin-bottom: 12rpx;
  color: #666;
  font-size: 28rpx;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-meta {
  display: flex;
  align-items: baseline;
  color: #999;
  font-size: 25rpx;
  line-height: 1.35;
  flex-wrap: wrap;
}
.paid-money {
  color: #1f1f1f;
  font-size: 27rpx;
  font-weight: 900;
}
.incident-story {
  display: block;
  margin-top: 12rpx;
  color: #f04426;
  font-size: 24rpx;
  line-height: 1.45;
}
.order-actions {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  padding: 18rpx 24rpx 20rpx;
  border-top: 1rpx solid #f0f0ee;
}
.action-button {
  min-width: 144rpx;
  height: 60rpx;
  margin: 0;
  padding: 0 24rpx;
  border-radius: 18rpx;
  font-size: 25rpx;
  font-weight: 800;
  line-height: 60rpx;
}
.action-button::after {
  border: 0;
}
.primary-action {
  color: #1f1f1f;
  background: #ffd400;
}
.ghost-action {
  color: #666;
  background: #fff;
  border: 2rpx solid #deded9;
}
.login-button { margin-top: 20rpx; }
.tab-spacer { height: 120rpx; }
</style>
