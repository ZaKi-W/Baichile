<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import type { HomeResponse } from '@baichile/api-contract';
import type { IconKey } from '@baichile/icon-registry';
import AppIcon from '../../components/AppIcon.vue';
import StoreCard from '../../components/StoreCard.vue';
import { catalogService } from '../../services/catalog';
import { useLocationStore } from '../../stores/location';

const data = ref<HomeResponse>();
const loading = ref(true);
const error = ref('');
const location = useLocationStore();
async function load() {
  loading.value = true; error.value = '';
  try { data.value = await catalogService.home(); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '加载失败'; }
  finally { loading.value = false; }
}
const openSearch = () => uni.navigateTo({ url: '/pages/search/index' });
const openCategory = (id: string, name: string) => uni.navigateTo({ url: `/pages/category/index?id=${id}&name=${encodeURIComponent(name)}` });
const openStore = (id: string) => uni.navigateTo({ url: `/pages/store/index?id=${id}` });
onLoad(load);
</script>

<template>
  <view class="page">
    <view class="top">
      <view class="location" @tap="location.locate"><AppIcon name="location" :size="18" /><text>{{ location.status === 'locating' ? '定位中…' : location.label }}</text></view>
      <view class="search" @tap="openSearch"><AppIcon name="search" :size="17" /><text>搜索虚拟店铺或菜品</text></view>
    </view>
    <view v-if="loading" class="card muted">正在准备虚拟菜单…</view>
    <view v-else-if="error" class="card"><text>{{ error }}</text><button size="mini" @tap="load">重试</button></view>
    <template v-else-if="data">
      <view class="categories">
        <view v-for="category in data.categories" :key="category.id" class="category" @tap="openCategory(category.id, category.name)">
          <AppIcon :name="category.icon as IconKey" :size="26" />
          <text>{{ category.name }}</text>
        </view>
      </view>
      <text class="section-title">夜航推荐</text>
      <StoreCard v-for="store in data.stores" :key="store.id" :store="store" @open="openStore(store.id)" />
    </template>
    <view class="tab-spacer" />
  </view>
</template>

<style scoped>
.top { display: flex; flex-direction: column; gap: 18rpx; margin-bottom: 24rpx; }
.top > view { display: flex; align-items: center; gap: 8rpx; }
.location { width: fit-content; }
.search { background: #fff; border-radius: 999rpx; padding: 18rpx 24rpx; color: #777; font-size: 26rpx; }
.categories { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20rpx; background: #fff; border-radius: 20rpx; padding: 24rpx; margin-bottom: 20rpx; }
.category { display: flex; align-items: center; flex-direction: column; gap: 8rpx; font-size: 23rpx; }
.section-title { display: block; margin: 8rpx 0 16rpx; font-weight: 700; font-size: 30rpx; }
.tab-spacer { height: 120rpx; }
</style>
