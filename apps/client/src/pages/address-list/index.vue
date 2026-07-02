<script setup lang="ts">
import { computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import type { Address } from '../../stores/address';
import { useAddressStore } from '../../stores/address';

const addressStore = useAddressStore();
const addresses = computed(() => addressStore.addresses);

onShow(() => { void addressStore.load(); });

function pick(addr: Address) {
  addressStore.select(addr.id);
  uni.navigateBack();
}

function remove(addr: Address) {
  uni.showModal({
    title: '删除地址',
    content: `确认删除「${addr.detail || addr.address}」？`,
    success: async ({ confirm }) => {
      if (confirm) {
        await addressStore.remove(addr.id);
      }
    },
  });
}

function addNew() {
  uni.navigateTo({ url: '/pages/address-form/index' });
}
</script>

<template>
  <view class="page">
    <view v-if="!addresses.length" class="empty">
      <text class="empty-icon">📍</text>
      <text class="empty-text">还没有收货地址</text>
    </view>

    <view v-for="addr in addresses" :key="addr.id" class="addr-card" @tap="pick(addr)">
      <view class="addr-main">
        <view class="addr-top">
          <text class="addr-name">{{ addr.name }}</text>
          <text class="addr-phone">{{ addr.phone }}</text>
          <text v-if="addr.tag" class="addr-tag">{{ addr.tag }}</text>
          <text v-if="addr.isDefault" class="addr-tag default">默认</text>
        </view>
        <text class="addr-text">{{ addr.address }}</text>
        <text v-if="addr.detail" class="addr-detail">{{ addr.detail }}</text>
      </view>
      <view class="addr-actions">
        <view class="action-btn" @tap.stop="remove(addr)">
          <text>删除</text>
        </view>
      </view>
    </view>

    <view class="bottom-bar">
      <button class="add-btn" @tap="addNew">+ 新增收货地址</button>
    </view>
  </view>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx 28rpx calc(160rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: #f5f5f3;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0;
}
.empty-icon { font-size: 80rpx; }
.empty-text { margin-top: 20rpx; color: #999; font-size: 28rpx; }

.addr-card {
  display: flex;
  align-items: stretch;
  gap: 16rpx;
  margin-bottom: 20rpx;
  padding: 28rpx 24rpx;
  border-radius: 24rpx;
  background: #fff;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, .04);
}
.addr-main { flex: 1; min-width: 0; }
.addr-top { display: flex; align-items: center; gap: 12rpx; flex-wrap: wrap; }
.addr-name { font-size: 30rpx; font-weight: 800; color: #151515; }
.addr-phone { font-size: 26rpx; color: #666; }
.addr-tag {
  font-size: 20rpx;
  font-weight: 600;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
  color: #888;
  background: #f0f0ee;
}
.addr-tag.default { color: #ff5b38; background: #fff0ec; }
.addr-text {
  display: block;
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #555;
  line-height: 1.4;
}
.addr-detail { display: block; margin-top: 4rpx; font-size: 24rpx; color: #999; }

.addr-actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 20rpx;
}
.action-btn {
  padding: 8rpx 16rpx;
  border-radius: 16rpx;
  color: #999;
  background: #f5f5f3;
  font-size: 22rpx;
}

.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20rpx 28rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, .06);
}
.add-btn {
  width: 100%;
  height: 88rpx;
  margin: 0;
  border-radius: 44rpx;
  color: #171717;
  background: #dff75a;
  font-size: 30rpx;
  font-weight: 800;
  line-height: 88rpx;
}
.add-btn::after { border: 0; }
</style>
