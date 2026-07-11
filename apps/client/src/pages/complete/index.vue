<script setup lang="ts">
const goHome = () => uni.switchTab({ url: '/pages/home/index' });
</script>

<template>
  <view class="page complete">
    <view class="success-mark"><image src="/static/icons/shield.svg" mode="aspectFit" /></view>
    <text class="title">订单已送达</text>
    <view class="virtual-notice">本单已按预计时间完成配送。</view>
    <button class="primary-button" @tap="goHome">再次逛逛</button>
  </view>
</template>

<style scoped>
.complete { display: flex; flex-direction: column; align-items: center; gap: 26rpx; padding: 120rpx 32rpx 48rpx; background: #fff; }
.success-mark { width: 132rpx; height: 132rpx; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #ffd400; }
.success-mark image { width: 72rpx; height: 72rpx; }
.title { font-weight: 900; font-size: 42rpx; }
.virtual-notice { width: 100%; box-sizing: border-box; text-align: center; }
.primary-button { width: 100%; height: 88rpx; margin-top: 10rpx; line-height: 88rpx; }
</style>
