<script setup lang="ts">
import type { StoreSummary } from '@baichile/api-contract';
defineProps<{ store: StoreSummary }>();
const money = (value: number) => (value / 100).toFixed(2);
</script>

<template>
  <view class="card store" @tap="$emit('open')">
    <view class="cover">{{ store.name.slice(0, 1) }}</view>
    <view class="info">
      <text class="name">{{ store.name }}</text>
      <text class="muted">{{ store.description }}</text>
      <view class="tags"><text v-for="tag in store.tags" :key="tag">{{ tag }}</text></view>
      <text class="muted">起送 ¥{{ money(store.minimumOrderCents) }} · 虚拟配送约 {{ store.virtualDeliveryMinutes }} 分钟</text>
    </view>
  </view>
</template>

<style scoped>
.store { display: flex; gap: 20rpx; }
.cover { width: 128rpx; height: 128rpx; border-radius: 16rpx; background: #f1f1f1; display: flex; align-items: center; justify-content: center; font-size: 44rpx; }
.info { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
.name { font-weight: 700; font-size: 30rpx; }
.tags { display: flex; gap: 8rpx; }
.tags text { font-size: 20rpx; background: #f6f6f6; padding: 4rpx 10rpx; border-radius: 6rpx; }
</style>

