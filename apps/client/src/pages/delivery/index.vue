<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { calculateDeliverySnapshot, interpolateAlongPolyline } from '@baichile/map-core';
import AppIcon from '../../components/AppIcon.vue';
import { useOrderStore } from '../../stores/orders';

const orders = useOrderStore();
const orderId = ref('');
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
const order = computed(() => orders.find(orderId.value));
const snapshot = computed(() => order.value
  ? calculateDeliverySnapshot(now.value, new Date(order.value.startedAt).getTime(), order.value.durationMs)
  : null);
const rider = computed(() => order.value && snapshot.value
  ? interpolateAlongPolyline(order.value.route.polyline, snapshot.value.progress) : null);
const statusText = computed(() => ({
  created: '虚拟订单已创建', merchant_accepted: '商家已模拟接单', preparing: '正在模拟备餐',
  rider_assigned: '虚拟骑手已接单', picked_up: '虚拟骑手已取餐', delivering: '正在前往虚拟目的地',
  virtual_arrived: '已到达虚拟终点', completed: '虚拟派送已完成',
}[snapshot.value?.status || 'created']));
onLoad((options) => { orderId.value = options?.id || ''; });
onShow(() => { now.value = Date.now(); clearInterval(timer); timer = setInterval(() => { now.value = Date.now(); }, 500); });
onBeforeUnmount(() => clearInterval(timer));
const openComplete = () => order.value && uni.redirectTo({ url: `/pages/complete/index?id=${order.value.id}` });
</script>

<template>
  <view v-if="order && snapshot" class="page">
    <view class="virtual-notice">骑手位置与配送路线均为虚拟演示，不对应真实配送。</view>
    <view class="card map-preview">
      <text class="badge">开发预览 · 预设 GCJ-02 路线</text>
      <view class="route-line" />
      <view class="origin">店</view><view class="destination">点</view>
      <view class="rider" :style="{ left: `${8 + snapshot.progress * 78}%`, top: `${70 - snapshot.progress * 38}%` }"><AppIcon name="rider" :size="28" /></view>
    </view>
    <view class="card status">
      <text class="title">{{ statusText }}</text>
      <text class="muted">预计还有 {{ Math.ceil(snapshot.remainingMs / 1000) }} 秒</text>
      <progress :percent="snapshot.progress * 100" activeColor="#ff7a45" />
      <text class="muted">当前位置：{{ rider?.lat.toFixed(5) }}, {{ rider?.lng.toFixed(5) }}（GCJ-02）</text>
    </view>
    <button v-if="snapshot.progress >= 1" class="primary-button" @tap="openComplete">查看完成页</button>
  </view>
  <view v-else class="page"><view class="card muted">未找到该虚拟订单。</view></view>
</template>

<style scoped>
.virtual-notice { margin-bottom: 20rpx; }
.map-preview { position: relative; height: 460rpx; overflow: hidden; background: #e9eee9; }
.badge { position: absolute; z-index: 3; background: #fff; padding: 8rpx 14rpx; border-radius: 8rpx; font-size: 20rpx; }
.route-line { position: absolute; width: 75%; height: 8rpx; background: #ff7a45; left: 12%; top: 56%; transform: rotate(-25deg); border-radius: 999rpx; }
.origin,.destination { position: absolute; background: #fff; width: 52rpx; height: 52rpx; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.origin { left: 7%; top: 68%; }.destination { right: 7%; top: 27%; }
.rider { position: absolute; transform: translate(-50%, -50%); transition: left .5s linear, top .5s linear; }
.status { display: flex; flex-direction: column; gap: 18rpx; }
.title { font-size: 34rpx; font-weight: 700; }
</style>
