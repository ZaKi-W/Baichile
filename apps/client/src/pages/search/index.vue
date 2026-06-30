<script setup lang="ts">
import { ref } from 'vue';
import type { StoreDetail } from '@baichile/api-contract';
import StoreCard from '../../components/StoreCard.vue';
import { catalogService } from '../../services/catalog';

const query = ref('');
const stores = ref<StoreDetail[]>([]);
const searched = ref(false);
async function search() {
  searched.value = true;
  stores.value = query.value.trim() ? await catalogService.search(query.value.trim()) : [];
}
const openStore = (id: string) => uni.navigateTo({ url: `/pages/store/index?id=${id}` });
</script>

<template>
  <view class="page">
    <view class="search-row"><input v-model="query" confirm-type="search" placeholder="搜索虚拟店铺或菜品" @confirm="search" /><button size="mini" @tap="search">搜索</button></view>
    <StoreCard v-for="store in stores" :key="store.id" :store="store" @open="openStore(store.id)" />
    <view v-if="searched && !stores.length" class="card muted">没有找到相关内容，换个词试试。</view>
  </view>
</template>

<style scoped>
.search-row { display: flex; gap: 12rpx; margin-bottom: 24rpx; }
input { flex: 1; background: #fff; border-radius: 999rpx; padding: 16rpx 24rpx; }
</style>
