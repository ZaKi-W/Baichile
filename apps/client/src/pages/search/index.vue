<script setup lang="ts">
import { ref } from 'vue';
import type { StoreSummary } from '@baichile/api-contract';
import StoreCard from '../../components/StoreCard.vue';
import { catalogService } from '../../services/catalog';

const query = ref('');
const stores = ref<StoreSummary[]>([]);
const searched = ref(false);
async function search() {
  searched.value = true;
  stores.value = query.value.trim() ? await catalogService.search(query.value.trim()) : [];
}
const openStore = (id: string) => uni.navigateTo({ url: `/pages/store/index?id=${id}` });
</script>

<template>
  <view class="page">
    <view class="search-row"><input v-model="query" confirm-type="search" placeholder="搜索店铺或菜品" @confirm="search" /><button @tap="search">搜索</button></view>
    <view v-if="stores.length" class="result-list"><StoreCard v-for="store in stores" :key="store.id" :store="store" @open="openStore(store.id)" /></view>
    <view v-if="searched && !stores.length" class="card muted">没有找到相关内容，换个词试试。</view>
  </view>
</template>

<style scoped>
.page { padding-top: 28rpx; }
.search-row { display: flex; gap: 12rpx; margin-bottom: 24rpx; padding: 8rpx; border: 3rpx solid #171717; border-radius: 42rpx; background: #fff; }
input { height: 62rpx; flex: 1; padding: 0 20rpx; font-size: 25rpx; }
.search-row button { width: 126rpx; height: 62rpx; margin: 0; padding: 0; border-radius: 31rpx; color: #171717; background: #ffd400; font-size: 24rpx; font-weight: 900; line-height: 62rpx; }
.search-row button::after { border: 0; }
.result-list { overflow: hidden; padding: 0 20rpx; border-radius: 26rpx; background: #fff; }
</style>
