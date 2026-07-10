<script setup lang="ts">
import { computed } from 'vue';
import { useCartStore } from '../../stores/cart';

const cart = useCartStore();
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight ?? 20;
const safeTopStyle = computed(() => ({ height: `${statusBarHeight + 12}px` }));
const groups = computed(() => cart.groups);
const hasCart = computed(() => groups.value.length > 0);
const checkoutText = computed(() => hasCart.value ? `合并结算 ${formatMoney(cart.allTotalCents)}` : '先去选餐');

function formatMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

function openHome() {
  uni.switchTab({ url: '/pages/home/index' });
}

function openStoreById(storeId: string) {
  uni.navigateTo({ url: `/pages/store/index?id=${storeId}` });
}

function checkout() {
  if (!hasCart.value) {
    openHome();
    return;
  }
  uni.navigateTo({ url: '/pages/checkout/index' });
}
</script>

<template>
  <view class="cart-page">
    <view class="safe-top" :style="safeTopStyle" />
    <view class="cart-main">
      <view class="page-head">
        <view>
          <text class="title">购物车</text>
          <text class="subtitle">{{ hasCart ? '确认这顿白吃的清单' : '还没选菜，先挑一家店吧' }}</text>
        </view>
        <button v-if="hasCart" class="clear-button" @tap="cart.clear">清空</button>
      </view>

      <view v-if="hasCart" class="group-list">
        <view v-for="group in groups" :key="group.store.id" class="store-cart-card">
          <view class="store-row" hover-class="store-row-active" @tap="openStoreById(group.store.id)">
            <image v-if="group.store.coverUrl" class="store-cover" :src="group.store.coverUrl" mode="aspectFill" />
            <view v-else class="store-cover cover-fallback">
              <text>{{ group.store.name.slice(0, 1) }}</text>
            </view>
            <view class="store-info">
              <text class="store-name">{{ group.store.name }}</text>
              <text class="store-meta">共 {{ group.count }} 件 · 配送 {{ group.store.virtualDeliveryMinutes }} 分钟</text>
            </view>
            <text class="store-arrow">›</text>
          </view>

          <view v-for="line in group.lines" :key="line.key" class="cart-line">
            <image v-if="line.item.imageUrl" class="dish-image" :src="line.item.imageUrl" mode="aspectFill" />
            <view v-else class="dish-image dish-fallback">
              <text>{{ line.item.name.slice(0, 1) }}</text>
            </view>
            <view class="line-info">
              <text class="line-name">{{ line.item.name }}</text>
              <text class="line-options">{{ line.optionNames.length ? line.optionNames.join('、') : '默认规格' }}</text>
              <text class="line-price">{{ formatMoney(line.totalCents) }}</text>
            </view>
            <view class="qty-control">
              <button class="qty-button" @tap="cart.updateQuantity(line.key, line.quantity - 1)">−</button>
              <text class="qty-text">{{ line.quantity }}</text>
              <button class="qty-button" @tap="cart.updateQuantity(line.key, line.quantity + 1)">＋</button>
            </view>
          </view>

          <view class="store-summary">
            <text>含配送/打包</text>
            <text>{{ formatMoney(group.totalCents) }}</text>
          </view>
        </view>
      </view>

      <view v-if="hasCart" class="summary-card">
        <view class="summary-row">
          <text>商品小计</text>
          <text>{{ formatMoney(cart.allItemsTotalCents) }}</text>
        </view>
        <view class="summary-row">
          <text>店铺数</text>
          <text>{{ groups.length }} 家</text>
        </view>
        <view class="summary-row">
          <text>配送/打包</text>
          <text>{{ formatMoney(cart.allTotalCents - cart.allItemsTotalCents) }}</text>
        </view>
        <view class="summary-total">
          <text>合计</text>
          <text>{{ formatMoney(cart.allTotalCents) }}</text>
        </view>
      </view>

      <view v-else class="empty-card">
        <view class="empty-mark">白</view>
        <text class="empty-title">购物车还是空的</text>
        <text class="empty-text">去首页挑一家店，选好菜后这里会自动汇总。</text>
        <button class="browse-button" @tap="openHome">去首页选餐</button>
      </view>
    </view>

    <view class="checkout-bar">
      <view>
        <text class="checkout-label">{{ hasCart ? `共 ${cart.allCount} 件 · ${groups.length} 家店` : '当前无商品' }}</text>
        <text class="checkout-price">{{ hasCart ? formatMoney(cart.allTotalCents) : '¥0.00' }}</text>
      </view>
      <button class="checkout-button" @tap="checkout">{{ checkoutText }}</button>
    </view>
  </view>
</template>

<style scoped>
.cart-page { min-height: 100vh; color: #151515; background: #f5f5f3; }
.safe-top { height: env(safe-area-inset-top); }
.cart-main { padding: 28rpx 28rpx calc(184rpx + env(safe-area-inset-bottom)); }
button { margin: 0; padding: 0; border: 0; color: inherit; background: transparent; line-height: normal; }
button::after { border: 0; }
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; margin-bottom: 28rpx; }
.title { display: block; font-size: 48rpx; line-height: 1.05; font-weight: 900; }
.subtitle { display: block; margin-top: 10rpx; color: #777; font-size: 24rpx; font-weight: 600; }
.clear-button { padding: 12rpx 20rpx; border-radius: 999rpx; color: #777; background: #fff; font-size: 23rpx; font-weight: 700; }
.store-cart-card, .summary-card, .empty-card { border-radius: 24rpx; background: #fff; box-shadow: 0 4rpx 18rpx rgba(0, 0, 0, .04); }
.group-list { display: grid; gap: 20rpx; }
.store-cart-card { overflow: hidden; }
.store-row { display: flex; align-items: center; gap: 16rpx; padding: 22rpx; }
.store-row-active { opacity: .72; }
.store-cover { width: 76rpx; height: 76rpx; border-radius: 16rpx; flex-shrink: 0; background: #ececea; }
.cover-fallback, .dish-fallback { display: flex; align-items: center; justify-content: center; color: #777; font-weight: 900; }
.store-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8rpx; }
.store-name { color: #1f1f1f; font-size: 30rpx; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.store-meta { color: #888; font-size: 22rpx; font-weight: 600; }
.store-arrow { color: #999; font-size: 42rpx; line-height: 1; }
.cart-line { display: flex; align-items: center; gap: 18rpx; padding: 24rpx 22rpx; border-bottom: 1rpx solid #f0f0ee; }
.cart-line:last-child { border-bottom: 0; }
.dish-image { width: 96rpx; height: 96rpx; border-radius: 18rpx; flex-shrink: 0; background: #ececea; }
.line-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.line-name { color: #1f1f1f; font-size: 28rpx; font-weight: 800; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.line-options { margin-top: 8rpx; color: #999; font-size: 22rpx; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.line-price { margin-top: 12rpx; color: #ff5b38; font-size: 27rpx; font-weight: 900; }
.qty-control { display: flex; align-items: center; gap: 12rpx; flex-shrink: 0; }
.qty-button { width: 48rpx; height: 48rpx; border-radius: 50%; color: #171717; background: #dff75a; font-size: 28rpx; font-weight: 900; line-height: 48rpx; }
.qty-text { min-width: 34rpx; color: #1f1f1f; font-size: 25rpx; font-weight: 800; text-align: center; }
.store-summary { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; padding: 18rpx 22rpx; color: #777; background: #fafafa; font-size: 24rpx; font-weight: 700; }
.store-summary text:last-child { color: #151515; font-size: 27rpx; font-weight: 900; }
.summary-card { margin-top: 20rpx; padding: 24rpx; }
.summary-row, .summary-total { display: flex; justify-content: space-between; align-items: center; gap: 20rpx; color: #777; font-size: 25rpx; line-height: 1.4; }
.summary-row + .summary-row { margin-top: 14rpx; }
.summary-total { margin-top: 22rpx; padding-top: 22rpx; border-top: 1rpx solid #f0f0ee; color: #151515; font-size: 30rpx; font-weight: 900; }
.summary-total text:last-child { color: #ff5b38; font-size: 36rpx; }
.empty-card { min-height: 520rpx; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 44rpx 38rpx; text-align: center; }
.empty-mark { width: 112rpx; height: 112rpx; display: flex; align-items: center; justify-content: center; margin-bottom: 26rpx; border-radius: 32rpx; color: #171717; background: #dff75a; font-size: 48rpx; font-weight: 900; }
.empty-title { color: #1f1f1f; font-size: 34rpx; font-weight: 900; }
.empty-text { max-width: 460rpx; margin-top: 12rpx; color: #777; font-size: 24rpx; line-height: 1.5; }
.browse-button { margin-top: 34rpx; padding: 20rpx 42rpx; border-radius: 999rpx; color: #171717; background: #dff75a; font-size: 28rpx; font-weight: 900; }
.checkout-bar { position: fixed; left: 24rpx; right: 24rpx; bottom: calc(24rpx + env(safe-area-inset-bottom)); z-index: 8; display: flex; align-items: center; justify-content: space-between; gap: 24rpx; padding: 20rpx 22rpx; border-radius: 28rpx; background: #151515; box-shadow: 0 18rpx 40rpx rgba(0, 0, 0, .14); }
.checkout-label { display: block; color: rgba(255,255,255,.62); font-size: 22rpx; font-weight: 700; }
.checkout-price { display: block; margin-top: 4rpx; color: #fff; font-size: 34rpx; font-weight: 900; }
.checkout-button { min-width: 230rpx; height: 76rpx; border-radius: 999rpx; color: #171717; background: #dff75a; font-size: 28rpx; font-weight: 900; line-height: 76rpx; }
</style>
