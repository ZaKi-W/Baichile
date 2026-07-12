<script setup lang="ts">
defineProps<{ current: number; total: number; label: string }>();
</script>

<template>
  <view class="progress-wrap">
    <view class="progress-meta"><text>{{ label }}</text><text>{{ current }}/{{ total }}</text></view>
    <view class="progress-track"><view class="progress-fill" :style="{ width: `${Math.round(current / total * 100)}%` }" /></view>
  </view>
</template>

<style scoped>
.progress-wrap{width:100%}.progress-meta{display:flex;justify-content:space-between;margin-bottom:14rpx;color:#665f54;font-size:24rpx;font-weight:700}.progress-track{height:12rpx;overflow:hidden;border:2rpx solid #191713;border-radius:999rpx;background:#fff}.progress-fill{height:100%;border-radius:999rpx;background:#ffd400;transition:width .2s ease}
</style>
