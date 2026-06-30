<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import AppIcon from '../components/AppIcon.vue';
import type { IconKey } from '@baichile/icon-registry';

const selected = ref(0);
const items: Array<{ path: string; label: string; icon: IconKey }> = [
  { path: '/pages/home/index', label: '首页', icon: 'home' },
  { path: '/pages/discover/index', label: '发现', icon: 'discover' },
  { path: '/pages/orders/index', label: '订单', icon: 'orders' },
  { path: '/pages/profile/index', label: '我的', icon: 'profile' },
];
function change(index: number) {
  selected.value = index;
  uni.switchTab({ url: items[index].path });
}
function syncSelected() {
  const route = `/${getCurrentPages().at(-1)?.route ?? ''}`;
  selected.value = Math.max(0, items.findIndex((item) => item.path === route));
}
onShow(syncSelected);
</script>

<template>
  <view class="tabbar-wrap">
    <view class="tabbar">
      <view v-for="(item, index) in items" :key="item.path" class="tab" :class="{ active: selected === index }" @tap="change(index)">
        <AppIcon :name="item.icon" :size="20" />
        <text>{{ item.label }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.tabbar-wrap { position: fixed; z-index: 30; left: 0; right: 0; bottom: 0; padding: 16rpx 24rpx calc(18rpx + env(safe-area-inset-bottom)); background: linear-gradient(to bottom, rgba(247, 247, 245, 0), rgba(247, 247, 245, .94) 28%, #f7f7f5 52%); pointer-events: none; }
.tabbar { height: 132rpx; display: flex; align-items: center; padding: 8rpx 12rpx; border: 1rpx solid rgba(20, 20, 20, .06); border-radius: 46rpx; background: rgba(255, 255, 255, .9); box-shadow: 0 24rpx 60rpx rgba(21, 21, 18, .13), inset 0 2rpx rgba(255, 255, 255, .76); backdrop-filter: blur(18px); pointer-events: auto; box-sizing: border-box; }
.tab { flex: 1; height: 112rpx; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 6rpx; border-radius: 36rpx; color: #898985; font-size: 20rpx; font-weight: 600; }
.tab.active { color: #141414; background: #f1f1ee; font-weight: 900; }
</style>
