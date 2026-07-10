<script setup lang="ts">
import type { CartLine } from '../stores/cart';

defineProps<{
  visible: boolean;
  lines: CartLine[];
  storeName?: string;
  totalCents: number;
  checkoutDisabled?: boolean;
  checkoutText: string;
}>();
defineEmits<{
  close: [];
  remove: [key: string];
  increase: [key: string];
  decrease: [key: string];
  clear: [];
  checkout: [];
}>();
</script>

<template>
  <view v-if="visible" class="mask" @tap="$emit('close')">
    <view class="sheet" @tap.stop>
      <view class="sheet-head">
        <view>
          <text class="title">已选商品</text>
          <text v-if="storeName" class="store-name">{{ storeName }}</text>
        </view>
        <button v-if="lines.length" class="clear-button" @tap="$emit('clear')">清空</button>
      </view>
      <view v-if="!lines.length" class="empty">购物车还是空的</view>
      <view v-for="line in lines" :key="line.key" class="line">
        <view class="details">
          <text class="name">{{ line.item.name }}</text>
          <text v-if="line.optionNames.length" class="muted">{{ line.optionNames.join('、') }}</text>
        </view>
        <view class="line-actions">
          <text class="price">¥{{ (line.totalCents / 100).toFixed(2) }}</text>
          <view class="quantity-control">
            <button class="qty-button" @tap="$emit('decrease', line.key)">−</button>
            <text class="quantity">{{ line.quantity }}</text>
            <button class="qty-button" @tap="$emit('increase', line.key)">＋</button>
          </view>
          <button class="remove-button" @tap="$emit('remove', line.key)">删除</button>
        </view>
      </view>
      <view class="footer">
        <view>
          <text class="footer-label">合计</text>
          <text class="footer-price">¥{{ (totalCents / 100).toFixed(2) }}</text>
        </view>
        <button class="checkout-button" :disabled="checkoutDisabled" @tap="$emit('checkout')">{{ checkoutText }}</button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.mask { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 40; display: flex; align-items: flex-end; }
.sheet { width: 100%; box-sizing: border-box; background: #fff; border-radius: 28rpx 28rpx 0 0; padding: 32rpx; padding-bottom: calc(150rpx + env(safe-area-inset-bottom)); }
.sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; margin-bottom: 20rpx; }
.title { display: block; font-size: 34rpx; font-weight: 700; }
.store-name { display: block; margin-top: 6rpx; color: #777; font-size: 23rpx; }
.clear-button { margin: 0; padding: 0 18rpx; border-radius: 18rpx; color: #666; background: #f5f5f3; font-size: 23rpx; line-height: 52rpx; }
.empty { padding: 40rpx 0 24rpx; color: #999; font-size: 26rpx; text-align: center; }
.line { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; padding: 18rpx 0; border-bottom: 1rpx solid #eee; }
.details { display: flex; flex: 1; flex-direction: column; gap: 6rpx; }
.name { font-weight: 600; }
.quantity { min-width: 36rpx; font-size: 24rpx; text-align: center; }
.price { font-weight: 700; }
.line-actions { display: flex; flex: 0 0 auto; align-items: flex-end; flex-direction: column; gap: 12rpx; }
.quantity-control { display: flex; align-items: center; gap: 10rpx; }
.qty-button { width: 44rpx; height: 44rpx; margin: 0; padding: 0; border-radius: 50%; color: #171717; background: #dff75a; font-size: 26rpx; line-height: 44rpx; }
.remove-button { margin: 0; padding: 0 14rpx; color: #a0442e; background: #fff0eb; border-radius: 14rpx; font-size: 21rpx; line-height: 42rpx; }
.footer { position: fixed; left: 32rpx; right: 32rpx; bottom: calc(28rpx + env(safe-area-inset-bottom)); display: flex; align-items: center; justify-content: space-between; gap: 24rpx; padding: 18rpx 0 0; background: #fff; }
.footer-label { display: block; color: #888; font-size: 22rpx; }
.footer-price { display: block; color: #151515; font-size: 34rpx; font-weight: 900; }
.checkout-button { min-width: 240rpx; height: 76rpx; margin: 0; padding: 0 28rpx; border-radius: 38rpx; color: #171717; background: #dff75a; font-size: 28rpx; font-weight: 900; line-height: 76rpx; }
.checkout-button[disabled] { color: rgba(255,255,255,.72); background: #bbb; }
.remove-button::after, .clear-button::after, .qty-button::after, .checkout-button::after { border: 0; }
</style>
