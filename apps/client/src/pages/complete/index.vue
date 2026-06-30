<script setup lang="ts">
import AppIcon from '../../components/AppIcon.vue';
const goHome = () => uni.switchTab({ url: '/pages/home/index' });
</script>

<template>
  <view class="page complete">
    <AppIcon name="success" :size="64" />
    <text class="title">虚拟派送完成</text>
    <view class="virtual-notice">本单已完成虚拟派送，不会有餐品送达。</view>
    <button class="primary-button" @tap="goHome">再次逛逛</button>
  </view>
</template>

<style scoped>
.complete { display: flex; flex-direction: column; align-items: center; gap: 28rpx; padding-top: 120rpx; }
.title { font-weight: 700; font-size: 40rpx; }
.virtual-notice { width: 100%; box-sizing: border-box; text-align: center; }
</style>
