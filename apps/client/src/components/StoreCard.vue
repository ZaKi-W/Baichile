<script setup lang="ts">
import { computed } from 'vue';
import type { StoreSummary } from '@baichile/api-contract';

const props = withDefaults(defineProps<{ store: StoreSummary; index?: number }>(), { index: 0 });
defineEmits<{ open: [] }>();

const money = (value: number) => {
  const amount = value / 100;
  return Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
};
const deliveryFee = (value: number) => value === 0 ? '免配送费' : `配送费¥${money(value)}`;
const distance = (value: number) => value < 1 ? `${Math.round(value * 1000)}m` : `${value.toFixed(1)}km`;
const foodIcons = ['🍗', '🍜', '🍔', '🍱', '🧋', '🍰', '🍢', '🥗'];
const avatar = computed(() => foodIcons[props.store.categoryId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % foodIcons.length]);
const visibleTags = computed(() => props.store.tags.slice(0, 2));
</script>

<template>
  <view class="store-card" :class="`tone-${index % 5}`" @tap="$emit('open')">
    <view class="merchant-avatar" aria-hidden="true"><text>{{ avatar }}</text></view>
    <view class="store-body">
      <view class="store-topline">
        <text class="store-name">{{ store.name }}</text>
        <text class="score">★ {{ store.rating.toFixed(1) }}</text>
      </view>
      <view class="store-meta">
        <text>¥{{ money(store.minimumOrderCents) }}起送</text>
        <i class="meta-divider" />
        <text>{{ deliveryFee(store.deliveryFeeCents) }}</text>
        <text>📍 {{ distance(store.distanceKm) }}</text>
        <text>🕒 {{ store.virtualDeliveryMinutes }}分钟</text>
      </view>
      <view class="tag-row">
        <text v-for="tag in visibleTags" :key="tag" class="store-tag">{{ tag }}</text>
        <text class="store-tag muted">月售{{ store.monthlySales }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.store-card { position: relative; min-height: 256rpx; display: grid; grid-template-columns: 152rpx minmax(0, 1fr); align-items: center; gap: 24rpx; padding: 24rpx; overflow: hidden; border-radius: 44rpx; color: #141414; background: #fff; box-shadow: inset 0 0 0 1rpx rgba(20, 20, 20, .08), 0 28rpx 56rpx rgba(21, 21, 18, .07); box-sizing: border-box; transition: transform .18s ease; }
.store-card:active { transform: scale(.985); }
.store-card::after { content: ""; position: absolute; right: -42rpx; bottom: -56rpx; width: 184rpx; height: 184rpx; border-radius: 50%; background: #ffe9e2; opacity: .62; pointer-events: none; }
.store-card.tone-1::after { background: #e6f3de; }
.store-card.tone-2::after { background: #e7edff; }
.store-card.tone-3::after { background: #fff1c9; }
.store-card.tone-4::after { background: #f5e5ff; }
.merchant-avatar { position: relative; z-index: 1; width: 152rpx; height: 152rpx; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 48rpx; font-size: 80rpx; background: #ffebe2; box-shadow: inset 0 0 0 1rpx rgba(20, 20, 20, .05); }
.tone-1 .merchant-avatar { background: #e7f3df; }
.tone-2 .merchant-avatar { background: #e5edff; }
.tone-3 .merchant-avatar { background: #fff1c8; }
.tone-4 .merchant-avatar { background: #f4e4ff; }
.merchant-avatar::before { content: ""; position: absolute; width: 176rpx; height: 62rpx; bottom: -28rpx; border-radius: 50%; background: rgba(255, 255, 255, .58); }
.merchant-avatar text { z-index: 1; transform: translateY(-4rpx); filter: drop-shadow(0 10rpx 8rpx rgba(0, 0, 0, .12)); }
.store-body { position: relative; z-index: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.store-topline { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.store-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 30rpx; line-height: 1.15; font-weight: 800; letter-spacing: -1rpx; }
.score { flex: 0 0 auto; color: #a95019; font-size: 22rpx; font-weight: 800; }
.store-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 12rpx 16rpx; margin: 16rpx 0; color: #777773; font-size: 22rpx; line-height: 1; font-weight: 600; }
.meta-divider { width: 1rpx; height: 20rpx; background: #deded9; }
.tag-row { display: flex; flex-wrap: wrap; gap: 10rpx; }
.store-tag { padding: 8rpx 12rpx 6rpx; border-radius: 14rpx; color: #745324; background: #fff0d0; font-size: 18rpx; line-height: 1; font-weight: 700; }
.store-tag.muted { color: #575754; background: #f1f1ee; }
@media (max-width: 356px) {
  .store-card { grid-template-columns: 134rpx minmax(0, 1fr); gap: 20rpx; }
  .merchant-avatar { width: 134rpx; height: 134rpx; border-radius: 42rpx; font-size: 70rpx; }
}
</style>
