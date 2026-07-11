<script setup lang="ts">
import { ref } from 'vue';
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

const failedImages = ref<string[]>([]);
const formatMoney = (cents: number) => `¥${(cents / 100).toFixed(2)}`;
const unitPriceCents = (line: CartLine) => line.quantity > 0
  ? Math.round(line.totalCents / line.quantity)
  : line.item.basePriceCents;
const imageVisible = (line: CartLine) => Boolean(
  line.item.imageUrl && !failedImages.value.includes(line.item.id),
);
const markImageFailed = (itemId: string) => {
  if (!failedImages.value.includes(itemId)) failedImages.value = [...failedImages.value, itemId];
};
</script>

<template>
  <view v-if="visible" class="mask" @tap="$emit('close')">
    <view class="sheet" @tap.stop>
      <view class="sheet-handle" />
      <view class="sheet-head">
        <view class="heading-copy">
          <view class="title-row">
            <text class="title">购物车</text>
            <text class="item-count">{{ lines.length }} 种菜品</text>
          </view>
          <text v-if="storeName" class="store-name">{{ storeName }}</text>
        </view>
        <button v-if="lines.length" class="clear-button" @tap="$emit('clear')">清空</button>
      </view>

      <view v-if="!lines.length" class="empty">购物车还是空的</view>
      <scroll-view v-else class="line-list" scroll-y :show-scrollbar="false">
        <view v-for="line in lines" :key="line.key" class="line">
          <view class="dish-visual">
            <image
              v-if="imageVisible(line)"
              class="dish-image"
              :src="line.item.imageUrl"
              mode="aspectFill"
              @error="markImageFailed(line.item.id)"
            />
            <text v-else class="dish-fallback">{{ line.item.name.slice(-1) }}</text>
          </view>

          <view class="details">
            <text class="name">{{ line.item.name }}</text>
            <view v-if="line.optionNames.length" class="spec-list">
              <text v-for="optionName in line.optionNames" :key="optionName" class="spec-tag">{{ optionName }}</text>
            </view>
            <text v-else class="default-spec">默认规格</text>
            <view class="price-row">
              <text class="unit-price">{{ formatMoney(unitPriceCents(line)) }}</text>
              <text class="unit-label">/ 份</text>
            </view>
          </view>

          <view class="line-side">
            <view class="subtotal">
              <text class="subtotal-label">小计</text>
              <text class="subtotal-price">{{ formatMoney(line.totalCents) }}</text>
            </view>
            <view class="quantity-control">
              <button class="qty-button minus" @tap="$emit('decrease', line.key)">−</button>
              <text class="quantity">{{ line.quantity }}</text>
              <button class="qty-button plus" @tap="$emit('increase', line.key)">＋</button>
            </view>
            <button class="remove-button" @tap="$emit('remove', line.key)">删除</button>
          </view>
        </view>
      </scroll-view>

      <view class="footer">
        <view class="total-block">
          <text class="footer-label">共 {{ lines.length }} 种 · 合计</text>
          <text class="footer-price">{{ formatMoney(totalCents) }}</text>
        </view>
        <button class="checkout-button" :disabled="checkoutDisabled" @tap="$emit('checkout')">{{ checkoutText }}</button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-end;
  background: rgba(12, 12, 10, .48);
}
.sheet {
  width: 100%;
  max-height: 82vh;
  padding: 16rpx 28rpx calc(24rpx + env(safe-area-inset-bottom));
  overflow: hidden;
  box-sizing: border-box;
  border-radius: 36rpx 36rpx 0 0;
  background: #fffdf8;
  box-shadow: 0 -24rpx 80rpx rgba(18, 18, 14, .16);
}
.sheet-handle { width: 72rpx; height: 8rpx; margin: 0 auto 26rpx; border-radius: 8rpx; background: #d9d6ce; }
.sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; padding: 0 4rpx 24rpx; border-bottom: 1rpx solid #ece8de; }
.heading-copy { min-width: 0; }
.title-row { display: flex; align-items: center; gap: 14rpx; }
.title { color: #171714; font-size: 38rpx; line-height: 1.2; font-weight: 900; }
.item-count { padding: 6rpx 12rpx; border-radius: 10rpx; color: #756e5f; background: #f2eee4; font-size: 20rpx; line-height: 1; font-weight: 700; }
.store-name { display: block; max-width: 480rpx; margin-top: 8rpx; overflow: hidden; color: #8a8478; font-size: 23rpx; white-space: nowrap; text-overflow: ellipsis; }
.clear-button { margin: 2rpx 0 0; padding: 0 6rpx; color: #8a4d3b; background: transparent; font-size: 23rpx; line-height: 48rpx; }
.empty { padding: 64rpx 0; color: #999388; font-size: 26rpx; text-align: center; }
.line-list { max-height: 53vh; }
.line { display: flex; align-items: stretch; gap: 18rpx; padding: 24rpx 4rpx; border-bottom: 1rpx solid #eeeae1; }
.line:last-child { border-bottom: 0; }
.dish-visual { flex: 0 0 118rpx; width: 118rpx; height: 118rpx; overflow: hidden; border-radius: 22rpx 8rpx 22rpx 8rpx; background: #f0eadc; }
.dish-image { width: 100%; height: 100%; }
.dish-fallback { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; color: #b27a38; font-size: 48rpx; font-weight: 900; }
.details { display: flex; min-width: 0; flex: 1; flex-direction: column; align-items: flex-start; }
.name { display: block; max-width: 100%; overflow: hidden; color: #22211d; font-size: 28rpx; line-height: 1.25; font-weight: 800; white-space: nowrap; text-overflow: ellipsis; }
.spec-list { display: flex; max-width: 100%; flex-wrap: wrap; gap: 6rpx; margin-top: 10rpx; }
.spec-tag { padding: 5rpx 10rpx; border: 1rpx solid #e4dfd3; border-radius: 8rpx; color: #777064; background: #f8f5ee; font-size: 19rpx; line-height: 1.2; }
.default-spec { margin-top: 10rpx; color: #aaa397; font-size: 20rpx; }
.price-row { display: flex; align-items: baseline; margin-top: auto; padding-top: 10rpx; }
.unit-price { color: #e84728; font-size: 27rpx; font-weight: 900; }
.unit-label { margin-left: 4rpx; color: #a49d91; font-size: 18rpx; }
.line-side { display: flex; flex: 0 0 156rpx; align-items: flex-end; flex-direction: column; }
.subtotal { display: flex; align-items: baseline; justify-content: flex-end; gap: 6rpx; }
.subtotal-label { color: #aaa397; font-size: 18rpx; }
.subtotal-price { color: #24231f; font-size: 26rpx; font-weight: 900; }
.quantity-control { display: flex; align-items: center; margin-top: auto; overflow: hidden; border: 1rpx solid #dfdbd1; border-radius: 22rpx; background: #fff; }
.qty-button { width: 48rpx; height: 44rpx; margin: 0; padding: 0; border-radius: 0; font-size: 26rpx; line-height: 44rpx; }
.qty-button.minus { color: #4d4a43; background: #fff; }
.qty-button.plus { color: #171714; background: #ffd400; }
.quantity { min-width: 46rpx; color: #24231f; font-size: 23rpx; font-weight: 800; text-align: center; }
.remove-button { margin: 8rpx 0 0; padding: 0 2rpx; color: #aaa397; background: transparent; font-size: 19rpx; line-height: 28rpx; }
.footer { display: flex; align-items: center; justify-content: space-between; gap: 22rpx; margin-top: 8rpx; padding: 22rpx 4rpx 0; border-top: 1rpx solid #e8e4da; background: #fffdf8; }
.total-block { min-width: 0; }
.footer-label { display: block; color: #8d877b; font-size: 20rpx; }
.footer-price { display: block; margin-top: 4rpx; color: #171714; font-size: 38rpx; line-height: 1; font-weight: 900; }
.checkout-button { min-width: 250rpx; height: 82rpx; margin: 0; padding: 0 30rpx; border-radius: 24rpx 8rpx 24rpx 8rpx; color: #171714; background: #ffd400; font-size: 27rpx; font-weight: 900; line-height: 82rpx; }
.checkout-button[disabled] { color: #87837a; background: #ddd9d0; }
.remove-button::after, .clear-button::after, .qty-button::after, .checkout-button::after { border: 0; }
</style>
