<script setup lang="ts">
import { ref } from 'vue';
import AppIcon from '../components/AppIcon.vue';
import type { IconKey } from '@baichile/icon-registry';

const selected = ref(0);
const items: Array<{ path: string; label: string; icon: IconKey }> = [
  { path: '/pages/home/index', label: '首页', icon: 'home' },
  { path: '/pages/orders/index', label: '订单', icon: 'orders' },
  { path: '/pages/profile/index', label: '我的', icon: 'profile' },
];
function change(index: number) {
  selected.value = index;
  uni.switchTab({ url: items[index].path });
}
</script>

<template>
  <view class="tabbar">
    <view v-for="(item, index) in items" :key="item.path" class="tab" :class="{ active: selected === index }" @tap="change(index)">
      <AppIcon :name="item.icon" :size="20" />
      <text>{{ item.label }}</text>
    </view>
  </view>
</template>

<style scoped>
.tabbar { position: fixed; left: 0; right: 0; bottom: 0; height: 112rpx; background: #fff; display: flex; border-top: 1rpx solid #eee; padding-bottom: env(safe-area-inset-bottom); z-index: 30; }
.tab { flex: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; font-size: 20rpx; color: #777; }
.tab.active { color: #ff7a45; }
</style>

