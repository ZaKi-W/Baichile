<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import type { StoreSummary } from '@baichile/api-contract';
import StoreCard from '../../components/StoreCard.vue';
import { catalogService } from '../../services/catalog';

const name = ref('分类');
const stores = ref<StoreSummary[]>([]);
const loading = ref(true);
const error = ref('');
const categoryId = ref('');
onLoad((options) => {
  const requestedId = decodeURIComponent(String(options?.id || '')).trim();
  const requestedName = decodeURIComponent(String(options?.name || '分类')).trim();
  name.value = requestedName || '分类';
  categoryId.value = requestedId;
  void load();
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    stores.value = categoryId.value ? await catalogService.byCategory(categoryId.value) : [];
  } catch (cause) {
    stores.value = [];
    error.value = cause instanceof Error ? cause.message : '分类加载失败';
  } finally {
    loading.value = false;
  }
}
const openStore = (id: string) => uni.navigateTo({ url: `/pages/store/index?id=${id}` });
</script>

<template>
  <view class="page">
    <view class="page-head">
      <text class="eyebrow">为你精选</text>
      <text class="heading">{{ name }}</text>
    </view>
    <view v-if="loading" class="card muted loading-state">正在加载店铺…</view>
    <view v-else-if="error" class="card category-error"><text>{{ error }}</text><button @tap="load">重新加载</button></view>
    <view v-else class="store-list">
      <StoreCard v-for="store in stores" :key="store.id" :store="store" @open="openStore(store.id)" />
    </view>
    <view v-if="!loading && !error && !stores.length" class="card muted">这个分类暂时没有虚拟店铺。</view>
  </view>
</template>

<style scoped>
.page { padding-top: 30rpx; background: #f6f6f6; }
.page-head { margin-bottom: 18rpx; }
.eyebrow { display: block; color: #9a7b00; font-size: 19rpx; font-weight: 800; }
.heading { display: block; margin-top: 6rpx; font-size: 40rpx; font-weight: 900; }
.store-list { overflow: hidden; padding: 0 20rpx; border-radius: 26rpx; background: #fff; }
.loading-state { text-align: center; }
.category-error { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; border: 2rpx solid #f04426; background: #fff0ec; }
.category-error button { margin: 0; padding: 0 22rpx; border-radius: 22rpx; color: #171717; background: #ffd400; font-size: 22rpx; line-height: 62rpx; }
.category-error button::after { border: 0; }
</style>
