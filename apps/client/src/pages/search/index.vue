<script setup lang="ts">
import { ref } from 'vue';
import type { StoreSummary } from '@baichile/api-contract';
import StoreCard from '../../components/StoreCard.vue';
import { catalogService } from '../../services/catalog';

const query = ref('');
const stores = ref<StoreSummary[]>([]);
const searched = ref(false);
const loading = ref(false);
const error = ref('');
let requestId = 0;
async function search() {
  const currentRequest = ++requestId;
  searched.value = true;
  loading.value = true;
  error.value = '';
  try {
    const result = query.value.trim() ? await catalogService.search(query.value.trim()) : [];
    if (currentRequest === requestId) stores.value = result;
  } catch (cause) {
    if (currentRequest === requestId) {
      stores.value = [];
      error.value = cause instanceof Error ? cause.message : '搜索失败';
    }
  } finally {
    if (currentRequest === requestId) loading.value = false;
  }
}
const openStore = (id: string) => uni.navigateTo({ url: `/pages/store/index?id=${id}` });
</script>

<template>
  <view class="page">
    <view class="search-row"><input v-model="query" confirm-type="search" placeholder="搜索店铺或菜品" @confirm="search" /><button @tap="search">搜索</button></view>
    <view v-if="loading" class="card muted">正在搜索模拟店铺…</view>
    <view v-else-if="error" class="card search-error"><text>{{ error }}</text><button @tap="search">重试</button></view>
    <view v-else-if="stores.length" class="result-list"><StoreCard v-for="store in stores" :key="store.id" :store="store" @open="openStore(store.id)" /></view>
    <view v-else-if="searched" class="card muted">没有找到相关内容，换个词试试。</view>
  </view>
</template>

<style scoped>
.page { padding-top: 28rpx; }
.search-row { display: flex; gap: 12rpx; margin-bottom: 24rpx; padding: 8rpx; border: 3rpx solid #171717; border-radius: 42rpx; background: #fff; }
input { height: 62rpx; flex: 1; padding: 0 20rpx; font-size: 25rpx; }
.search-row button { width: 126rpx; height: 62rpx; margin: 0; padding: 0; border-radius: 31rpx; color: #171717; background: #ffd400; font-size: 24rpx; font-weight: 900; line-height: 62rpx; }
.search-row button::after { border: 0; }
.result-list { overflow: hidden; padding: 0 20rpx; border-radius: 26rpx; background: #fff; }
.search-error { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; border: 2rpx solid #f04426; background: #fff0ec; }
.search-error button { margin: 0; padding: 0 22rpx; border-radius: 22rpx; color: #171717; background: #ffd400; font-size: 22rpx; line-height: 62rpx; }
.search-error button::after { border: 0; }
</style>
