<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { VirtualOrder } from '@baichile/api-contract';
import {
  createHomeOrderSummary,
  createVisibleHomeOrderSummaries,
  formatOrderRemaining,
} from '../utils/home-order-summary';

const props = defineProps<{
  orders: VirtualOrder[];
  now: number;
  visibleOrderIds: string[];
}>();

const emit = defineEmits<{
  open: [orderId: string];
  dismiss: [orderId: string];
}>();

const activeIndex = ref(0);
const summaries = computed(() => createVisibleHomeOrderSummaries(
  props.orders,
  props.now,
  props.visibleOrderIds,
));

watch(() => summaries.value.length, (length) => {
  if (activeIndex.value >= length) activeIndex.value = Math.max(0, length - 1);
});

function remainingText(summary: ReturnType<typeof createHomeOrderSummary>) {
  if (summary.terminal) return summary.refundLabel || '订单已结束';
  if (summary.statusLabel === '突发事件') return `情况确认中 · ${formatOrderRemaining(summary.remainingMs)}`;
  return `预计剩余 ${formatOrderRemaining(summary.remainingMs)}`;
}

function onChange(event: { detail: { current: number } }) {
  activeIndex.value = event.detail.current;
}
</script>

<template>
  <section v-if="summaries.length" class="home-orders">
    <swiper class="orders-swiper" :current="activeIndex" :indicator-dots="summaries.length > 1" @change="onChange">
      <swiper-item v-for="summary in summaries" :key="summary.order.id">
        <view class="order-card" :class="{ incident: summary.incidentText }" @tap="emit('open', summary.order.id)">
          <view class="order-card-top">
            <view>
              <text class="order-kicker">订单进行中</text>
              <text class="order-status">{{ summary.statusLabel }}</text>
            </view>
            <button
              class="order-close"
              @tap.stop="emit('dismiss', summary.order.id)"
            >×</button>
          </view>
          <text class="order-items">{{ summary.itemText }}</text>
          <view v-if="summary.incidentText" class="order-incident-block">
            <text class="order-incident-badge">配送彩蛋</text>
            <text class="order-incident">{{ summary.incidentText }}</text>
          </view>
          <view class="order-meta">
            <text>{{ remainingText(summary) }}</text>
            <text>¥{{ (summary.order.totalCents / 100).toFixed(2) }}</text>
          </view>
          <view class="order-progress">
            <view class="order-progress-fill" :style="{ width: `${summary.progress * 100}%` }" />
          </view>
          <text v-if="summaries.length > 1" class="orders-page">{{ activeIndex + 1 }}/{{ summaries.length }}</text>
        </view>
      </swiper-item>
    </swiper>
  </section>
</template>

<style scoped>
.home-orders { margin-bottom: 20rpx; }
.orders-swiper { height: 238rpx; }
.order-card { position: relative; height: 218rpx; padding: 22rpx 24rpx; overflow: hidden; border: 1rpx solid #e7e7e7; border-radius: 28rpx; color: #171717; background: #fff; box-shadow: 0 8rpx 22rpx rgba(23,23,23,.05); box-sizing: border-box; }
.order-card.incident { border-color: #f0a48f; background: #fff1ec; }
.order-card-top, .order-meta { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; }
.order-kicker { display: inline-block; margin-right: 12rpx; color: #171717; font-size: 22rpx; font-weight: 900; }
.order-status { color: #9a7b00; font-size: 20rpx; font-weight: 800; }
.order-close { width: 44rpx; height: 44rpx; min-height: 0; padding: 0; border: 1rpx solid #d6d6d6; border-radius: 50%; color: #777; background: #fff; font-size: 28rpx; line-height: 40rpx; }
.order-close::after { border: 0; }
.order-items { display: block; margin-top: 13rpx; overflow: hidden; color: #666; font-size: 20rpx; white-space: nowrap; text-overflow: ellipsis; }
.order-incident-block { display: flex; align-items: center; gap: 10rpx; margin-top: 8rpx; overflow: hidden; }
.order-incident-badge { flex-shrink: 0; padding: 4rpx 8rpx; border-radius: 6rpx; color: #ffd400; background: #191713; font-size: 16rpx; font-weight: 900; line-height: 1.2; }
.order-incident { min-width: 0; flex: 1; overflow: hidden; color: #b33d25; font-size: 20rpx; font-weight: 800; white-space: nowrap; text-overflow: ellipsis; }
.order-meta { margin-top: 15rpx; color: #555; font-size: 19rpx; font-weight: 600; }
.order-progress { height: 7rpx; margin-top: 15rpx; overflow: hidden; border-radius: 7rpx; background: #efefef; }
.order-progress-fill { height: 100%; border-radius: inherit; background: #ffd400; transition: width .3s linear; }
.orders-page { position: absolute; right: 24rpx; bottom: 11rpx; color: #999; font-size: 16rpx; }
</style>
