<script setup lang="ts">
import { ref } from 'vue';
import type { StoreSummary } from '@baichile/api-contract';

const props = withDefaults(defineProps<{ store: StoreSummary; index?: number }>(), { index: 0 });
defineEmits<{ open: [] }>();

const money = (value: number) => {
  const amount = value / 100;
  return Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
};
const deliveryFee = (value: number) => value === 0 ? '免配送费' : `配送费¥${money(value)}`;
const distance = (value: number) => value < 1 ? `${Math.round(value * 1000)}m` : `${value.toFixed(1)}km`;
const visibleTags = () => props.store.tags.slice(0, 2);
const imageFailed = ref(false);
</script>

<template>
  <view class="store-card" @tap="$emit('open')">
    <view class="merchant-visual" aria-hidden="true">
      <image v-if="store.coverUrl && !imageFailed" class="merchant-cover" :src="store.coverUrl" mode="aspectFill" @error="imageFailed = true" />
      <view v-else class="merchant-fallback">
        <text class="fallback-brand">这顿白吃</text>
        <text class="fallback-name">{{ store.name.slice(0, 2) }}</text>
      </view>
      <text v-if="index < 3" class="merchant-badge">{{ index === 0 ? '口碑' : index === 1 ? '人气' : '新店' }}</text>
    </view>
    <view class="store-body">
      <view class="store-topline">
        <text class="store-name">{{ store.name }}</text>
      </view>
      <view class="store-meta">
        <text class="score">评分 {{ store.rating.toFixed(1) }}</text>
        <text>月售{{ store.monthlySales }}</text>
        <text class="delivery-speed">{{ store.virtualDeliveryMinutes }}分钟</text>
        <text>{{ distance(store.distanceKm) }}</text>
      </view>
      <text class="delivery-line">起送 ¥{{ money(store.minimumOrderCents) }}　{{ deliveryFee(store.deliveryFeeCents) }}</text>
      <view class="tag-row">
        <text v-for="tag in visibleTags()" :key="tag" class="store-tag">{{ tag }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.store-card { position: relative; min-height: 216rpx; display: grid; grid-template-columns: 190rpx minmax(0, 1fr); align-items: stretch; gap: 18rpx; padding: 18rpx 0; border-bottom: 1rpx solid #ededed; color: #171717; background: #fff; box-sizing: border-box; transition: opacity .15s ease; }
.store-card:active { opacity: .72; }
.merchant-visual { position: relative; min-height: 180rpx; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 16rpx; background: #f3f3f3; }
.merchant-cover { position: absolute; inset: 0; width: 100%; height: 100%; }
.merchant-fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; color: #171717; background: #fff3b0; }
.fallback-brand { font-size: 17rpx; font-weight: 900; }
.fallback-name { margin-top: 9rpx; font-size: 34rpx; font-weight: 900; }
.merchant-badge { position: absolute; z-index: 3; top: 0; left: 0; padding: 7rpx 12rpx; border-radius: 18rpx 0 16rpx 0; color: #171717; background: #ffd400; font-size: 16rpx; font-weight: 900; }
.store-body { min-width: 0; display: flex; flex-direction: column; padding: 2rpx 0; }
.store-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 27rpx; line-height: 1.2; font-weight: 900; }
.store-meta { display: flex; align-items: center; gap: 10rpx; margin-top: 12rpx; color: #777; font-size: 18rpx; line-height: 1; }
.score { color: #f06b16; font-weight: 900; }
.delivery-speed { margin-left: auto; color: #333; }
.delivery-line { display: block; overflow: hidden; margin-top: 12rpx; color: #777; font-size: 18rpx; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
.tag-row { display: flex; flex-wrap: wrap; gap: 7rpx; margin-top: auto; padding-top: 11rpx; }
.store-tag { padding: 6rpx 9rpx; border: 1rpx solid #ff9b8b; border-radius: 7rpx; color: #f04426; font-size: 16rpx; line-height: 1; font-weight: 600; }
@media (max-width: 356px) {
  .store-card { grid-template-columns: 174rpx minmax(0, 1fr); gap: 16rpx; }
  .merchant-visual { min-height: 170rpx; }
  .store-name { font-size: 25rpx; }
  .store-meta { gap: 8rpx; font-size: 17rpx; }
}
</style>
