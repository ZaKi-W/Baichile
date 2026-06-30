<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useOrderStore } from '../../stores/orders';
const auth = useAuthStore();
const orders = useOrderStore();
const identity = computed(() => auth.accountId ? '开发态模拟登录用户' : '游客');
async function login() {
  try { await auth.devLogin(); uni.showToast({ title: '游客订单已合并', icon: 'none' }); }
  catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '登录失败', icon: 'none' }); }
}
</script>

<template>
  <view class="page">
    <view class="card profile"><text class="title">{{ identity }}</text><text class="muted">游客也可以浏览、下单和观看虚拟配送</text><text class="muted">最近虚拟订单：{{ orders.orders.length }} 单</text></view>
    <button v-if="!auth.accountId" class="primary-button" @tap="login">开发态模拟微信登录</button>
    <view class="card notice"><text>关于白吃了</text><text class="muted">这是互动模拟产品，不提供真实支付、接单或配送。</text></view>
    <view class="tab-spacer" />
  </view>
</template>

<style scoped>
.profile,.notice { display: flex; flex-direction: column; gap: 14rpx; }
.title { font-size: 36rpx; font-weight: 700; }
.notice { margin-top: 20rpx; }
.tab-spacer { height: 120rpx; }
</style>

