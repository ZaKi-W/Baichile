<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import type { HomeResponse } from '@baichile/api-contract';
import type { IconKey } from '@baichile/icon-registry';
import AppIcon from '../../components/AppIcon.vue';
import StoreCard from '../../components/StoreCard.vue';
import { catalogService } from '../../services/catalog';

const data = ref<HomeResponse>();
const loading = ref(true);
const error = ref('');
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight ?? 20;
const safeTopStyle = computed(() => ({ height: `${statusBarHeight + 14}px` }));
const featuredStores = computed(() => data.value?.featured.length ? data.value.featured : data.value?.stores.slice(0, 5) ?? []);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await catalogService.home();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载失败';
  } finally {
    loading.value = false;
  }
}
const openCategory = (id: string, name: string) => uni.navigateTo({ url: `/pages/category/index?id=${id}&name=${encodeURIComponent(name)}` });
const openStore = (id: string) => uni.navigateTo({ url: `/pages/store/index?id=${id}` });
onLoad(load);
</script>

<template>
  <view class="discover-page">
    <view class="safe-top" :style="safeTopStyle" />
    <main class="discover-main">
      <header class="discover-header">
        <view>
          <text class="eyebrow">BAICHILE PICKS</text>
          <text class="title">发现好味道</text>
          <text class="subtitle">从附近真实数据里，挑出值得点开的店。</text>
        </view>
        <text class="spark">✦</text>
      </header>

      <view v-if="loading" class="state-block">正在寻找附近好味道…</view>
      <view v-else-if="error" class="state-block error-state">
        <text>{{ error }}</text>
        <button @tap="load">重新加载</button>
      </view>

      <template v-else-if="data">
        <section>
          <view class="section-header">
            <text class="section-title">按口味逛</text>
            <text class="section-hint">{{ data.categories.length }} 个分类</text>
          </view>
          <scroll-view class="topic-scroll" scroll-x :show-scrollbar="false">
            <view class="topic-row">
              <button
                v-for="category in data.categories"
                :key="category.id"
                class="topic"
                @tap="openCategory(category.id, category.name)"
              >
                <view class="topic-icon"><AppIcon :name="category.icon as IconKey" :size="27" /></view>
                <text>{{ category.name }}</text>
              </button>
            </view>
          </scroll-view>
        </section>

        <section>
          <view class="section-header featured-heading">
            <view>
              <text class="section-title">本周精选</text>
              <text class="section-caption">高热度与好口碑，都在这里</text>
            </view>
            <text class="rank-badge">TOP {{ featuredStores.length }}</text>
          </view>
          <view v-if="featuredStores.length" class="store-list">
            <StoreCard
              v-for="(store, index) in featuredStores"
              :key="store.id"
              :store="store"
              :index="index"
              @open="openStore(store.id)"
            />
          </view>
          <view v-else class="state-block">精选店铺正在整理中</view>
        </section>
      </template>
    </main>
  </view>
</template>

<style scoped>
.discover-page { min-height: 100vh; color: #141414; background: #f7f7f5; }
.safe-top { height: env(safe-area-inset-top); }
.discover-main { padding: 34rpx 32rpx calc(220rpx + env(safe-area-inset-bottom)); }
button { margin: 0; padding: 0; border: 0; color: inherit; background: transparent; line-height: normal; }
button::after { border: 0; }
.discover-header { position: relative; min-height: 276rpx; display: flex; align-items: flex-end; justify-content: space-between; overflow: hidden; padding: 42rpx 38rpx; border-radius: 54rpx; color: #fff; background: radial-gradient(circle at 84% 12%, rgba(223, 247, 90, .88) 0 15%, transparent 16%), linear-gradient(125deg, #141414 5%, #234027 100%); box-shadow: 0 32rpx 74rpx rgba(21, 21, 18, .12); box-sizing: border-box; }
.discover-header::after { content: ""; position: absolute; width: 300rpx; height: 300rpx; right: -120rpx; top: -100rpx; border: 1rpx solid rgba(255, 255, 255, .18); border-radius: 84rpx; transform: rotate(24deg); }
.discover-header > view, .spark { position: relative; z-index: 1; }
.eyebrow { display: block; margin-bottom: 16rpx; color: #dff75a; font-size: 20rpx; font-weight: 900; letter-spacing: 2rpx; }
.title { display: block; font-size: 62rpx; line-height: 1; font-weight: 900; letter-spacing: -4rpx; }
.subtitle { display: block; margin-top: 18rpx; color: rgba(255, 255, 255, .66); font-size: 24rpx; font-weight: 600; }
.spark { font-size: 72rpx; color: #dff75a; }
.section-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24rpx; margin: 52rpx 2rpx 26rpx; }
.section-title { display: block; font-size: 40rpx; line-height: 1; font-weight: 900; letter-spacing: -2rpx; }
.section-hint, .section-caption { color: #777773; font-size: 22rpx; font-weight: 600; }
.section-caption { display: block; margin-top: 12rpx; }
.topic-scroll { width: calc(100% + 64rpx); margin-left: -32rpx; white-space: nowrap; }
.topic-row { display: inline-flex; gap: 18rpx; padding: 0 32rpx 18rpx; }
.topic { width: 156rpx; display: flex; align-items: center; flex-direction: column; gap: 14rpx; padding: 20rpx 12rpx 18rpx; border: 1rpx solid rgba(20, 20, 20, .06); border-radius: 36rpx; background: #fff; box-shadow: 0 16rpx 32rpx rgba(20, 20, 20, .04); font-size: 23rpx; font-weight: 700; }
.topic-icon { width: 92rpx; height: 92rpx; display: flex; align-items: center; justify-content: center; border-radius: 32rpx; background: #fff0e9; }
.topic:nth-child(3n + 2) .topic-icon { background: #eff8d5; }
.topic:nth-child(3n) .topic-icon { background: #e9efff; }
.featured-heading { align-items: center; }
.rank-badge { padding: 12rpx 18rpx; border-radius: 18rpx; color: #3f5112; background: #dff75a; font-size: 20rpx; font-weight: 900; }
.store-list { display: grid; gap: 24rpx; }
.state-block { margin-top: 40rpx; padding: 32rpx; border: 1rpx solid rgba(20, 20, 20, .06); border-radius: 32rpx; color: #71716f; background: rgba(255, 255, 255, .72); font-size: 26rpx; text-align: center; }
.error-state { display: flex; align-items: center; justify-content: space-between; text-align: left; }
.error-state button { padding: 14rpx 24rpx; border-radius: 999rpx; color: #fff; background: #141414; font-size: 24rpx; }
</style>
