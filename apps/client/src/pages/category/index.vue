<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import type { StoreSummary } from '@baichile/api-contract';
import StoreCard from '../../components/StoreCard.vue';
import { catalogService } from '../../services/catalog';

const name = ref('分类');
const stores = ref<StoreSummary[]>([]);
const loading = ref(true);
onLoad(async (options) => {
  const requestedId = decodeURIComponent(String(options?.id || '')).trim();
  const requestedName = decodeURIComponent(String(options?.name || '分类')).trim();
  name.value = requestedName || '分类';

  try {
    stores.value = requestedId ? await catalogService.byCategory(requestedId) : [];
  } catch {
    stores.value = [];
  } finally {
    loading.value = false;
  }
});
const openStore = (id: string) => uni.navigateTo({ url: `/pages/store/index?id=${id}` });
</script>

<template>
  <view class="page">
    <view class="page-head">
      <text class="eyebrow">为你精选</text>
      <text class="heading">{{ name }}</text>
    </view>
    <view v-if="loading" class="card muted loading-state">正在加载店铺…</view>
    <view v-else class="store-list">
      <StoreCard v-for="store in stores" :key="store.id" :store="store" @open="openStore(store.id)" />
    </view>
    <view v-if="!loading && !stores.length" class="card muted">这个分类暂时没有虚拟店铺。</view>
  </view>
</template>

<style scoped>
.page { padding-top: 30rpx; background: #f6f6f6; }
.page-head { margin-bottom: 18rpx; }
.eyebrow { display: block; color: #9a7b00; font-size: 19rpx; font-weight: 800; }
.heading { display: block; margin-top: 6rpx; font-size: 40rpx; font-weight: 900; }
.store-list { overflow: hidden; padding: 0 20rpx; border-radius: 26rpx; background: #fff; }
.loading-state { text-align: center; }
</style>
