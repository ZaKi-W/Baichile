<script setup lang="ts">
import type { StoreSummary } from '@baichile/api-contract';
defineProps<{ store: StoreSummary }>();
const money = (value: number) => {
  const amount = value / 100;
  return Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
};
const deliveryFee = (value: number) => value === 0 ? '免配送费' : `配送费 ¥${money(value)}`;
</script>

<template>
  <view class="card store" @tap="$emit('open')">
    <view class="cover">{{ store.name.slice(0, 1) }}</view>
    <view class="info">
      <view class="heading">
        <text class="name">{{ store.name }}</text>
        <text class="rating">{{ store.rating.toFixed(1) }}分</text>
      </view>
      <text class="metrics">月售 {{ store.monthlySales }} · {{ store.distanceKm.toFixed(1) }}km · {{ store.virtualDeliveryMinutes }}分钟</text>
      <view class="delivery">
        <text>¥{{ money(store.minimumOrderCents) }}起送</text>
        <text :class="{ free: store.deliveryFeeCents === 0 }">{{ deliveryFee(store.deliveryFeeCents) }}</text>
      </view>
      <view class="tags"><text v-for="tag in store.tags" :key="tag">{{ tag }}</text></view>
    </view>
  </view>
</template>

<style scoped>
.store { display: flex; align-items: flex-start; gap: 20rpx; }
.cover { width: 128rpx; height: 128rpx; border-radius: 16rpx; background: #f1f1f1; display: flex; align-items: center; justify-content: center; font-size: 44rpx; }
.info { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
.heading, .delivery { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.name { min-width: 0; overflow: hidden; font-weight: 700; font-size: 30rpx; text-overflow: ellipsis; white-space: nowrap; }
.rating { flex-shrink: 0; color: #d65523; font-size: 25rpx; font-weight: 700; }
.metrics, .delivery { color: #666; font-size: 23rpx; }
.delivery { justify-content: flex-start; }
.delivery text + text::before { content: '·'; margin: 0 10rpx; color: #bbb; }
.delivery .free { color: #388e3c; }
.tags { display: flex; flex-wrap: wrap; gap: 8rpx; margin-top: 2rpx; }
.tags text { font-size: 20rpx; background: #f6f6f6; padding: 4rpx 10rpx; border-radius: 6rpx; }
</style>
