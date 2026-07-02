<script setup lang="ts">
import { ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import { useAuthStore } from '../../stores/auth';
import { useOrderStore } from '../../stores/orders';
import { getOrderStep } from '../../utils/order-status';
const auth = useAuthStore();
const orders = useOrderStore();
const now = ref(Date.now());
let statusTimer: ReturnType<typeof setInterval> | undefined;
const openOrder = (id: string) => uni.navigateTo({ url: `/pages/delivery/index?id=${id}` });
const openLogin = () => uni.switchTab({ url: '/pages/profile/index' });
const statusLabel = (startedAt: string, durationMs: number) => {
  const step = getOrderStep(new Date(startedAt).getTime(), durationMs, now.value);
  return step.listLabel || step.label;
};
const isCompleted = (startedAt: string, durationMs: number) =>
  getOrderStep(new Date(startedAt).getTime(), durationMs, now.value).key === 'completed';
onShow(() => {
  now.value = Date.now();
  void orders.load();
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
    <view v-for="order in auth.accountId ? orders.orders : []" :key="order.id" class="card" @tap="openOrder(order.id)">
      <view class="row">
        <view class="order-heading">
          <text>虚拟订单</text>
          <text class="status-badge">{{ statusLabel(order.startedAt, order.durationMs) }}</text>
        </view>
        <view v-if="isCompleted(order.startedAt, order.durationMs)" class="savings">
          <text>省 ¥{{ (order.totalCents / 100).toFixed(2) }}</text>
          <text class="calorie-saving">约省 {{ order.itemsTotalCaloriesKcal }} 千卡</text>
        </view>
        <text v-else>¥{{ (order.totalCents / 100).toFixed(2) }}</text>
      </view>
      <text class="muted">{{ new Date(order.startedAt).toLocaleString() }}</text>
    </view>
    <view v-if="auth.accountId && !orders.orders.length" class="card muted">还没有虚拟订单，先去首页逛逛吧。</view>
    <view class="tab-spacer" />
  </view>
</template>

<style scoped>
.row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12rpx; font-weight: 600; }
.order-heading { display: flex; align-items: center; gap: 14rpx; }
.status-badge { padding: 5rpx 12rpx; border-radius: 999rpx; background: #fff0eb; color: #ff5b38; font-size: 22rpx; font-weight: 600; }
.savings { display: flex; flex-direction: column; align-items: flex-end; color: #ff5b38; }
.calorie-saving { margin-top: 4rpx; color: #7b8c38; font-size: 22rpx; font-weight: 500; }
.login-button { margin-top: 20rpx; }
.tab-spacer { height: 120rpx; }
</style>
