<script setup lang="ts">
import { PERSONALITIES } from '../../features/personality-test/personas';
import type { PersonalityResult } from '../../features/personality-test/types';

defineProps<{ result: PersonalityResult }>();
</script>

<template>
  <view class="result-card">
    <view class="result-top"><text class="mode">{{ result.mode === 'quick' ? '极速饭格' : '完整饭格' }}</text><text class="code">{{ result.primaryCode }}</text></view>
    <image
      class="persona-image"
      :src="PERSONALITIES[result.primaryCode].imageUrl"
      mode="widthFix"
    />
    <text class="name">{{ result.title }}</text>
    <text class="trait">{{ PERSONALITIES[result.primaryCode].coreTrait }}</text>
    <view v-if="result.isDualPersonality" class="dual">你拥有明显的双重饭格</view>
    <view class="secondary"><text>副人格</text><text>{{ result.secondaryCode }} · {{ PERSONALITIES[result.secondaryCode].name }}</text></view>
    <text class="quote">“{{ result.quote }}”</text>
  </view>
</template>

<style scoped>
.result-card{padding:34rpx;border:3rpx solid #191713;background:#ffd400;box-shadow:10rpx 10rpx 0 rgba(25,23,19,.16)}.result-top{display:flex;align-items:flex-start;justify-content:space-between}.mode{padding:8rpx 14rpx;background:#191713;color:#ffd400;font-size:21rpx;font-weight:900}.code{font-size:58rpx;font-weight:950;line-height:1}.persona-image{display:block;width:100%;margin-top:28rpx;border:3rpx solid #191713;box-sizing:border-box;background:#fff}.name{display:block;margin-top:34rpx;font-size:52rpx;font-weight:950}.trait{display:block;margin-top:12rpx;font-size:25rpx;font-weight:700;line-height:1.5}.dual{display:inline-flex;margin-top:28rpx;padding:12rpx 18rpx;border:2rpx solid #191713;background:#fff;font-size:23rpx;font-weight:900}.secondary{display:flex;justify-content:space-between;margin-top:34rpx;padding-top:24rpx;border-top:2rpx solid rgba(25,23,19,.45);font-size:24rpx;font-weight:800}.quote{display:block;margin-top:34rpx;padding:24rpx;background:#fff;font-size:30rpx;font-weight:900;line-height:1.5;text-align:center}
</style>
