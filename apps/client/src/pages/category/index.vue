<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import type { StoreDetail } from '@baichile/api-contract';
import StoreCard from '../../components/StoreCard.vue';
import { catalogService } from '../../services/catalog';

const name = ref('分类');
const stores = ref<StoreDetail[]>([]);
onLoad(async (options) => {
  name.value = decodeURIComponent(options?.name || '分类');
  stores.value = await catalogService.byCategory(options?.id || '');
});
const openStore = (id: string) => uni.navigateTo({ url: `/pages/store/index?id=${id}` });
</script>

<template>
  <view class="page">
    <text class="heading">{{ name }}</text>
    <view class="store-list">
      <StoreCard v-for="store in stores" :key="store.id" :store="store" @open="openStore(store.id)" />
    </view>
    <view v-if="!stores.length" class="card muted">这个分类暂时没有虚拟店铺。</view>
  </view>
</template>

<style scoped>
.heading { display: block; font-size: 36rpx; font-weight: 700; margin: 8rpx 0 24rpx; }
.store-list { display: flex; flex-direction: column; gap: 24rpx; }
</style>
