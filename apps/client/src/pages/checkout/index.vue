<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useCartStore } from '../../stores/cart';
import { useOrderStore } from '../../stores/orders';
import { useAddressStore } from '../../stores/address';
import { orderService } from '../../services/orders';
import { useAuthStore } from '../../stores/auth';
import { useWalletStore } from '../../stores/wallet';
import { ApiRequestError } from '../../services/http';

const cart = useCartStore();
const orders = useOrderStore();
const addressStore = useAddressStore();
const auth = useAuthStore();
const wallet = useWalletStore();
const submitting = ref(false);

const selectedAddress = computed(() => addressStore.selected);

onShow(() => { void addressStore.load(); });

function openAddressPicker() {
  uni.navigateTo({ url: '/pages/address-list/index' });
}

const request = computed(() => ({
  storeId: cart.store?.id || '',
  virtualDestinationId: selectedAddress.value?.id || 'unknown',
  virtualDestinationPoint: selectedAddress.value
    ? { lat: selectedAddress.value.lat, lng: selectedAddress.value.lng, coordSystem: 'gcj02' as const }
    : undefined,
  lines: cart.lines.map((line) => ({ menuItemId: line.item.id, optionIds: line.optionIds, quantity: line.quantity })),
}));

const canSubmit = computed(() => cart.lines.length > 0 && !!selectedAddress.value);

async function submit() {
  if (!canSubmit.value || submitting.value) return;
  if (!auth.accountId) {
    auth.requestLogin();
    uni.showToast({ title: '请先登录后使用虚拟余额下单', icon: 'none' });
    setTimeout(() => uni.switchTab({ url: '/pages/profile/index' }), 350);
    return;
  }
  if (!selectedAddress.value) {
    uni.showToast({ title: '请选择收货地址', icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    const order = await orderService.create(request.value);
    orders.save(order);
    wallet.recordPayment(order.totalCents);
    cart.clear();
    uni.redirectTo({ url: `/pages/delivery/index?id=${order.id}` });
    void wallet.load().catch(() => undefined);
  } catch (error) {
    const insufficient = error instanceof ApiRequestError && error.code === 'INSUFFICIENT_BALANCE';
    uni.showToast({ title: insufficient ? '余额不足' : '订单创建失败，请重试', icon: 'none' });
  } finally { submitting.value = false; }
}
</script>

<template>
  <view class="page">
    <view class="virtual-notice">仅扣除应用内虚拟余额，不涉及真实支付。</view>

    <!-- 收货地址卡片 -->
    <view class="address-card" @tap="openAddressPicker">
      <view v-if="selectedAddress" class="address-info">
        <view class="address-top">
          <text class="address-name">{{ selectedAddress.name }}</text>
          <text class="address-phone">{{ selectedAddress.phone }}</text>
          <text v-if="selectedAddress.tag" class="address-tag">{{ selectedAddress.tag }}</text>
        </view>
        <text class="address-text">{{ selectedAddress.address }}</text>
        <text v-if="selectedAddress.detail" class="address-detail">{{ selectedAddress.detail }}</text>
      </view>
      <view v-else class="address-empty">
        <text class="empty-text">请选择收货地址</text>
      </view>
      <text class="address-arrow">›</text>
    </view>

    <!-- 订单商品 -->
    <view class="card order-card">
      <text class="heading">{{ cart.store?.name }}</text>
      <view v-for="line in cart.lines" :key="line.key" class="line">
        <view class="line-left">
          <text class="line-name">{{ line.item.name }} × {{ line.quantity }}</text>
          <text class="line-opts">{{ line.optionNames.join('、') }}</text>
        </view>
        <text class="line-price">¥{{ (line.totalCents / 100).toFixed(2) }}</text>
      </view>
      <view class="line fee"><text>配送费</text><text>¥{{ ((cart.store?.deliveryFeeCents || 0) / 100).toFixed(2) }}</text></view>
      <view class="line fee"><text>打包费</text><text>¥{{ ((cart.store?.packingFeeCents || 0) / 100).toFixed(2) }}</text></view>
      <view class="line total"><text>合计</text><text class="total-price">¥{{ (cart.totalCents / 100).toFixed(2) }}</text></view>
    </view>

    <!-- 提交按钮 -->
    <button class="submit-btn" :loading="submitting" :disabled="!canSubmit" @tap="submit">
      {{ !selectedAddress ? '请先选择地址' : '提交订单' }}
    </button>
  </view>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx 28rpx calc(180rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: #f5f5f3;
}

.virtual-notice {
  padding: 16rpx 20rpx;
  margin-bottom: 20rpx;
  border-radius: 16rpx;
  color: #b8860b;
  background: #fff8e6;
  font-size: 22rpx;
  font-weight: 600;
  text-align: center;
}

/* ── 地址卡片 ── */
.address-card {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 28rpx 24rpx;
  margin-bottom: 24rpx;
  border-radius: 24rpx;
  background: #fff;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, .04);
}
.address-info { flex: 1; min-width: 0; }
.address-top { display: flex; align-items: center; gap: 12rpx; flex-wrap: wrap; }
.address-name { font-size: 32rpx; font-weight: 800; color: #151515; }
.address-phone { font-size: 26rpx; color: #666; }
.address-tag {
  font-size: 20rpx;
  font-weight: 600;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
  color: #ff5b38;
  background: #fff0ec;
}
.address-text {
  display: block;
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #555;
  line-height: 1.4;
}
.address-detail { display: block; margin-top: 4rpx; font-size: 24rpx; color: #999; }
.address-empty { flex: 1; }
.empty-text { font-size: 28rpx; color: #999; }
.address-arrow { font-size: 40rpx; color: #ccc; font-weight: 300; }

/* ── 订单卡片 ── */
.card {
  margin-bottom: 24rpx;
  padding: 28rpx 24rpx;
  border-radius: 24rpx;
  background: #fff;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, .04);
}
.heading { display: block; font-size: 30rpx; font-weight: 800; margin-bottom: 20rpx; color: #151515; }
.line {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  padding: 14rpx 0;
  border-bottom: 1rpx solid #f0f0ee;
}
.line-left { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.line-name { font-size: 26rpx; font-weight: 600; color: #333; }
.line-opts { margin-top: 4rpx; font-size: 22rpx; color: #999; }
.line-price { font-size: 26rpx; font-weight: 700; color: #333; white-space: nowrap; }
.fee { border-bottom: 0; padding: 8rpx 0; }
.fee text { font-size: 24rpx; color: #999; }
.total { border-bottom: 0; padding-top: 16rpx; border-top: 1rpx solid #f0f0ee; }
.total text { font-size: 28rpx; font-weight: 800; color: #151515; }
.total-price { color: #ff5b38; font-size: 32rpx; }

/* ── 提交按钮 ── */
.submit-btn {
  position: fixed;
  left: 28rpx;
  right: 28rpx;
  bottom: calc(24rpx + env(safe-area-inset-bottom));
  height: 96rpx;
  margin: 0;
  border-radius: 48rpx;
  color: #171717;
  background: #dff75a;
  font-size: 32rpx;
  font-weight: 900;
  line-height: 96rpx;
  box-shadow: 0 12rpx 32rpx rgba(0, 0, 0, .1);
}
.submit-btn[disabled] { color: rgba(255, 255, 255, .5); background: #bbb; }
.submit-btn::after { border: 0; }
</style>
