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
      </view>
      <view class="merchant-meta">
        <text>月售 {{ store.monthlySales }}</text>
        <text v-if="store.tags[0]" class="merchant-tag">{{ store.tags[0] }}</text>
      </view>
      <view class="fulfilment">
        <view class="fees">
          <text>起送 ¥{{ money(store.minimumOrderCents) }}</text>
          <text>{{ deliveryFee(store.deliveryFeeCents) }}</text>
        </view>
        <text class="distance">{{ store.distanceKm.toFixed(1) }}km&nbsp;&nbsp;{{ store.virtualDeliveryMinutes }}分钟</text>
      </view>
      <view class="reputation">
        <text class="rating">{{ store.rating.toFixed(1) }}分</text>
        <text>最近24小时{{ store.recentViewers }}人看过</text>
      </view>
      <view class="tags"><text v-for="tag in store.tags.slice(1, 3)" :key="tag">{{ tag }}</text></view>
    </view>
  </view>
</template>

<style scoped>
.store { display: flex; align-items: flex-start; gap: 22rpx; padding: 26rpx; }
.cover { flex: 0 0 180rpx; width: 180rpx; height: 180rpx; border-radius: 14rpx; background: #f6efe7; color: #b85d2d; display: flex; align-items: center; justify-content: center; font-size: 60rpx; font-weight: 700; }
.info { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 10rpx; }
.heading { min-width: 0; }
.name { display: block; min-width: 0; overflow: hidden; font-weight: 700; font-size: 32rpx; line-height: 42rpx; text-overflow: ellipsis; white-space: nowrap; }
.merchant-meta, .fulfilment, .fees, .reputation, .tags { display: flex; align-items: center; }
.merchant-meta { gap: 12rpx; color: #888; font-size: 23rpx; }
.merchant-tag { color: #339447; }
.fulfilment { justify-content: space-between; gap: 12rpx; color: #777; font-size: 22rpx; white-space: nowrap; }
.fees { min-width: 0; gap: 14rpx; }
.distance { flex-shrink: 0; }
.reputation { gap: 18rpx; overflow: hidden; color: #dd6818; font-size: 23rpx; font-weight: 600; white-space: nowrap; }
.rating { flex-shrink: 0; font-size: 29rpx; font-weight: 700; }
.tags { gap: 8rpx; overflow: hidden; }
.tags text { flex-shrink: 0; padding: 3rpx 9rpx; border: 1rpx solid #f0d8c7; border-radius: 6rpx; color: #b66a3c; font-size: 19rpx; }
</style>
