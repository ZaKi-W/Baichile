<script setup lang="ts">
import type { CartLine } from '../stores/cart';

defineProps<{ visible: boolean; lines: CartLine[] }>();
defineEmits<{ close: []; remove: [key: string] }>();
</script>

<template>
  <view v-if="visible" class="mask" @tap="$emit('close')">
    <view class="sheet" @tap.stop>
      <text class="title">已选商品</text>
      <view v-for="line in lines" :key="line.key" class="line">
        <view class="details">
          <text class="name">{{ line.item.name }}</text>
          <text v-if="line.optionNames.length" class="muted">{{ line.optionNames.join('、') }}</text>
          <text class="quantity">× {{ line.quantity }}</text>
        </view>
        <view class="line-actions">
          <text class="price">¥{{ (line.totalCents / 100).toFixed(2) }}</text>
          <button class="remove-button" @tap="$emit('remove', line.key)">删除</button>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.mask { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 40; display: flex; align-items: flex-end; }
.sheet { width: 100%; box-sizing: border-box; background: #fff; border-radius: 28rpx 28rpx 0 0; padding: 32rpx; padding-bottom: calc(150rpx + env(safe-area-inset-bottom)); }
.title { display: block; margin-bottom: 20rpx; font-size: 34rpx; font-weight: 700; }
.line { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; padding: 18rpx 0; border-bottom: 1rpx solid #eee; }
.details { display: flex; flex: 1; flex-direction: column; gap: 6rpx; }
.name { font-weight: 600; }
.quantity { font-size: 24rpx; }
.price { font-weight: 700; }
.line-actions { display: flex; flex: 0 0 auto; align-items: flex-end; flex-direction: column; gap: 12rpx; }
.remove-button { margin: 0; padding: 0 14rpx; color: #a0442e; background: #fff0eb; border-radius: 14rpx; font-size: 21rpx; line-height: 42rpx; }
.remove-button::after { border: 0; }
</style>
