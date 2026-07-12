<script setup lang="ts">
import { AXIS_LABELS } from '../../features/personality-test/personas';
import type { AxisKey, AxisScores } from '../../features/personality-test/types';

defineProps<{ dimensions: AxisScores }>();
const axes: AxisKey[] = ['appetite', 'explore', 'control', 'social'];
</script>

<template>
  <view class="dimensions">
    <view v-for="axis in axes" :key="axis" class="dimension">
      <view class="dimension-head"><text>{{ AXIS_LABELS[axis].name }}</text><text>{{ dimensions[axis] }}</text></view>
      <view class="bar"><view class="fill" :style="{ width: `${dimensions[axis]}%` }" /></view>
      <view class="labels"><text>{{ AXIS_LABELS[axis].low }}</text><text>{{ AXIS_LABELS[axis].high }}</text></view>
    </view>
  </view>
</template>

<style scoped>
.dimensions{display:flex;flex-direction:column;gap:28rpx}.dimension-head,.labels{display:flex;justify-content:space-between}.dimension-head{margin-bottom:12rpx;font-size:26rpx;font-weight:900}.bar{height:18rpx;overflow:hidden;border:2rpx solid #191713;border-radius:999rpx;background:#f0eadc}.fill{height:100%;background:#2e8b72}.labels{margin-top:8rpx;color:#7b7265;font-size:20rpx}
</style>
