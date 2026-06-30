<script setup lang="ts">
import { useOrderStore } from '../../stores/orders';
const orders = useOrderStore();
const openOrder = (id: string) => uni.navigateTo({ url: `/pages/delivery/index?id=${id}` });
</script>

<template>
  <view class="page">
    <view v-for="order in orders.orders" :key="order.id" class="card" @tap="openOrder(order.id)">
      <view class="row"><text>虚拟订单</text><text>¥{{ (order.totalCents / 100).toFixed(2) }}</text></view>
      <text class="muted">{{ new Date(order.startedAt).toLocaleString() }} · 不会真实送达</text>
    </view>
    <view v-if="!orders.orders.length" class="card muted">还没有虚拟订单，先去首页逛逛吧。</view>
    <view class="tab-spacer" />
  </view>
</template>

<style scoped>.row { display: flex; justify-content: space-between; margin-bottom: 12rpx; font-weight: 600; }.tab-spacer { height: 120rpx; }</style>
