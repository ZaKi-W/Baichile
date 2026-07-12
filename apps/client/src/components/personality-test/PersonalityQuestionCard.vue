<script setup lang="ts">
import type { QuizOption, QuizQuestion } from '../../features/personality-test/types';

defineProps<{ question: QuizQuestion; options: QuizOption[]; selectedId: string }>();
const emit = defineEmits<{ select: [optionId: string] }>();
</script>

<template>
  <view class="question-card">
    <text class="question-id">{{ question.id }}</text>
    <text class="question-title">{{ question.title }}</text>
    <view class="options">
      <view
        v-for="(option, index) in options"
        :key="`${question.id}-${option.id}`"
        class="option"
        :class="{ selected: selectedId === option.id }"
        @tap="emit('select', option.id)"
      >
        <text class="option-index">{{ String.fromCharCode(65 + index) }}</text>
        <text class="option-text">{{ option.text }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.question-card{margin-top:34rpx}.question-id{display:inline-flex;padding:8rpx 16rpx;background:#191713;color:#ffd400;font-size:22rpx;font-weight:900;letter-spacing:2rpx}.question-title{display:block;min-height:140rpx;margin-top:26rpx;color:#191713;font-size:42rpx;font-weight:950;line-height:1.45}.options{display:flex;flex-direction:column;gap:22rpx;margin-top:20rpx}.option{display:flex;align-items:center;gap:22rpx;min-height:118rpx;padding:22rpx;border:3rpx solid #191713;border-radius:18rpx;box-sizing:border-box;background:#fff;box-shadow:6rpx 6rpx 0 rgba(25,23,19,.12)}.option.selected{background:#ffd400;transform:translate(4rpx,4rpx);box-shadow:2rpx 2rpx 0 rgba(25,23,19,.18)}.option-index{display:flex;flex:0 0 54rpx;align-items:center;justify-content:center;width:54rpx;height:54rpx;border:2rpx solid #191713;border-radius:50%;font-size:25rpx;font-weight:900}.option-text{flex:1;font-size:28rpx;font-weight:700;line-height:1.5}
</style>
