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
    <view class="orders-heading">
      <text>订单进度</text>
      <text v-if="summaries.length > 1" class="orders-page">{{ activeIndex + 1 }}/{{ summaries.length }}</text>
    </view>
    <swiper class="orders-swiper" :current="activeIndex" :indicator-dots="summaries.length > 1" @change="onChange">
      <swiper-item v-for="summary in summaries" :key="summary.order.id">
        <view class="order-card" :class="{ incident: summary.incidentText }" @tap="emit('open', summary.order.id)">
          <view class="order-card-top">
            <text class="order-status">{{ summary.statusLabel }}</text>
            <button
              class="order-close"
              @tap.stop="emit('dismiss', summary.order.id)"
            >×</button>
          </view>
          <text class="order-items">{{ summary.itemText }}</text>
          <text v-if="summary.incidentText" class="order-incident">{{ summary.incidentText }}</text>
          <view class="order-meta">
            <text>{{ remainingText(summary) }}</text>
            <text>¥{{ (summary.order.totalCents / 100).toFixed(2) }}</text>
          </view>
          <view class="order-progress">
            <view class="order-progress-fill" :style="{ width: `${summary.progress * 100}%` }" />
          </view>
        </view>
      </swiper-item>
    </swiper>
  </section>
</template>

<style scoped>
.home-orders { margin-top: 34rpx; }
.orders-heading { display: flex; align-items: center; justify-content: space-between; margin: 0 4rpx 16rpx; font-size: 28rpx; font-weight: 900; }
.orders-page { color: #878782; font-size: 22rpx; font-weight: 700; }
.orders-swiper { height: 284rpx; }
.order-card { height: 252rpx; padding: 28rpx 30rpx; border-radius: 38rpx; color: #fff; background: linear-gradient(135deg, #171717, #393936); box-shadow: 0 20rpx 54rpx rgba(20, 20, 20, .12); box-sizing: border-box; }
.order-card.incident { background: linear-gradient(135deg, #4d2f89, #8b4dc4); }
.order-card-top, .order-meta { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; }
.order-status { font-size: 30rpx; font-weight: 900; }
.order-close { width: 48rpx; height: 48rpx; min-height: 0; padding: 0; border: 0; border-radius: 50%; color: #fff; background: rgba(255,255,255,.16); font-size: 32rpx; line-height: 44rpx; }
.order-close::after { border: 0; }
.order-items { display: block; margin-top: 18rpx; overflow: hidden; color: rgba(255,255,255,.72); font-size: 24rpx; white-space: nowrap; text-overflow: ellipsis; }
.order-incident { display: block; margin-top: 12rpx; overflow: hidden; font-size: 25rpx; font-weight: 800; white-space: nowrap; text-overflow: ellipsis; }
.order-meta { margin-top: 20rpx; color: rgba(255,255,255,.82); font-size: 22rpx; font-weight: 700; }
.order-progress { height: 8rpx; margin-top: 18rpx; overflow: hidden; border-radius: 999rpx; background: rgba(255,255,255,.2); }
.order-progress-fill { height: 100%; border-radius: inherit; background: #dff75a; transition: width .3s linear; }
</style>
