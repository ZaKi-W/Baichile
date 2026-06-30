<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
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
const activeSlide = ref(0);
const activeFilter = ref('综合排序');
const filters = ['综合排序', '距离最近', '评分最高', '预计更快', '免配送费'];
let carouselTimer: ReturnType<typeof setInterval> | undefined;

const heroSlides = [
  { eyebrow: '✦ 本周主题餐单', title: '认真吃饭，\n不必将就。', description: '精选附近口碑店，把今天这一顿吃明白。', action: '去看看', food: '🍛', counter: '新店上架', tone: 'new' },
  { eyebrow: '🔥 热门商家榜', title: '附近人都在\n点这些。', description: '高评分、近距离，下单更不容易踩雷。', action: '查看榜单', food: '🍔', counter: '热门榜', tone: 'hot' },
  { eyebrow: '🛵 虚拟派送演示', title: '点完以后，\n看它一路送来。', description: '订单完成后将展示模拟骑手路线与送达进度。', action: '体验流程', food: '🛵', counter: '实时演示', tone: 'virtual' },
];

const sortedStores = computed(() => {
  const stores = [...(data.value?.stores ?? [])];
  if (activeFilter.value === '距离最近') return stores.sort((a, b) => a.distanceKm - b.distanceKm);
  if (activeFilter.value === '评分最高') return stores.sort((a, b) => b.rating - a.rating);
  if (activeFilter.value === '预计更快') return stores.sort((a, b) => a.virtualDeliveryMinutes - b.virtualDeliveryMinutes);
  if (activeFilter.value === '免配送费') return stores.sort((a, b) => Number(a.deliveryFeeCents > 0) - Number(b.deliveryFeeCents > 0));
  return stores;
});

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
const openSearch = () => uni.navigateTo({ url: '/pages/search/index' });
const openProfile = () => uni.switchTab({ url: '/pages/profile/index' });
const openCategory = (id: string, name: string) => uni.navigateTo({ url: `/pages/category/index?id=${id}&name=${encodeURIComponent(name)}` });
const openStore = (id: string) => uni.navigateTo({ url: `/pages/store/index?id=${id}` });
const openAllCategories = () => {
  const first = data.value?.categories[0];
  if (first) openCategory(first.id, first.name);
};
const scan = () => uni.scanCode?.({ success: () => undefined });
function runHeroAction(index: number) {
  if (index === 0) openAllCategories();
  else if (index === 1) uni.switchTab({ url: '/pages/discover/index' });
  else uni.switchTab({ url: '/pages/orders/index' });
}
function showSlide(index: number) {
  activeSlide.value = (index + heroSlides.length) % heroSlides.length;
}
function startCarousel() {
  stopCarousel();
  carouselTimer = setInterval(() => showSlide(activeSlide.value + 1), 4800);
}
function stopCarousel() {
  if (carouselTimer) clearInterval(carouselTimer);
  carouselTimer = undefined;
}

onLoad(load);
onShow(startCarousel);
onHide(stopCarousel);
onUnload(stopCarousel);
</script>

<template>
  <view class="home-page">
    <main class="app-main">
      <header class="topbar">
        <button class="location-button" @tap="location.locate">
          <AppIcon name="location" :size="17" />
          <text class="location-name">{{ location.status === 'locating' ? '定位中…' : location.label }}</text>
          <text class="chevron">⌄</text>
        </button>
        <button class="profile-button" @tap="openProfile"><AppIcon name="profile" :size="19" /></button>
      </header>

      <view class="search-wrap">
        <view class="search" @tap="openSearch">
          <AppIcon name="search" :size="18" />
          <text>搜店铺、菜品、口味</text>
        </view>
        <button class="search-scan" @tap.stop="scan">⌁</button>
      </view>

      <section class="hero">
        <view class="hero-track">
          <article
            v-for="(slide, index) in heroSlides"
            :key="slide.tone"
            class="hero-slide"
            :class="[`hero-${slide.tone}`, { active: activeSlide === index }]"
          >
            <view class="hero-copy">
              <view>
                <text class="hero-eyebrow">{{ slide.eyebrow }}</text>
                <text class="hero-title">{{ slide.title }}</text>
                <text class="hero-desc">{{ slide.description }}</text>
              </view>
              <button class="hero-action" @tap="runHeroAction(index)">{{ slide.action }} →</button>
            </view>
            <view class="hero-visual">
              <text class="hero-food">{{ slide.food }}</text>
              <text class="hero-counter">{{ slide.counter }}</text>
            </view>
          </article>
        </view>
        <view class="hero-controls">
          <button
            v-for="(_, index) in heroSlides"
            :key="index"
            class="hero-dot"
            :class="{ active: activeSlide === index }"
            @tap="showSlide(index); startCarousel()"
          />
        </view>
      </section>

      <view v-if="loading" class="state-block">正在准备虚拟菜单…</view>
      <view v-else-if="error" class="state-block error-state">
        <text>{{ error }}</text>
        <button @tap="load">重新加载</button>
      </view>

      <template v-else-if="data">
        <section>
          <view class="section-header">
            <text class="section-title">今天吃什么</text>
            <button class="section-link" @tap="openAllCategories">全部分类 ›</button>
          </view>
          <view v-if="data.categories.length" class="category-grid">
            <button
              v-for="category in data.categories.slice(0, 8)"
              :key="category.id"
              class="category-item"
              @tap="openCategory(category.id, category.name)"
            >
              <view class="category-icon"><AppIcon :name="category.icon as IconKey" :size="29" /></view>
              <text class="category-name">{{ category.name }}</text>
            </button>
          </view>
          <view v-else class="empty-inline">分类正在整理中</view>
        </section>

        <section>
          <view class="section-header recommendation-heading">
            <view class="recommendation-title">
              <text class="section-title">附近推荐</text>
              <text class="recommendation-badge">真实口碑</text>
            </view>
            <text class="section-link">排序 ⇅</text>
          </view>
          <scroll-view class="filter-row" scroll-x :show-scrollbar="false">
            <view class="filter-content">
              <button
                v-for="filter in filters"
                :key="filter"
                class="filter-chip"
                :class="{ active: activeFilter === filter }"
                @tap="activeFilter = filter"
              >{{ filter }}</button>
            </view>
          </scroll-view>
          <view v-if="sortedStores.length" class="store-list">
            <StoreCard
              v-for="(store, index) in sortedStores"
              :key="store.id"
              :store="store"
              :index="index"
              @open="openStore(store.id)"
            />
          </view>
          <view v-else class="empty-inline">附近暂时没有虚拟店铺</view>
          <view class="route-note">
            <AppIcon name="rider" :size="16" />
            <text><strong>这是虚拟外卖演示。</strong>下单后会展示模拟派送路线与送达进度。</text>
          </view>
        </section>
      </template>
    </main>
  </view>
</template>

<style scoped>
.home-page { min-height: 100vh; color: #141414; background: #f7f7f5; }
.app-main { padding: calc(env(safe-area-inset-top) + 28rpx) 32rpx calc(220rpx + env(safe-area-inset-bottom)); }
button { padding: 0; border: 0; color: inherit; background: transparent; line-height: normal; }
button::after { border: 0; }
.topbar { min-height: 80rpx; display: flex; align-items: center; justify-content: space-between; margin: 4rpx 0 26rpx; }
.location-button { min-width: 0; max-width: 570rpx; display: flex; align-items: center; gap: 14rpx; }
.location-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 32rpx; font-weight: 800; letter-spacing: -1rpx; }
.chevron { color: #7b7b78; font-size: 26rpx; transform: translateY(2rpx); }
.profile-button { width: 76rpx; height: 76rpx; display: flex; align-items: center; justify-content: center; border-radius: 28rpx; background: #fff; box-shadow: 0 2rpx 0 rgba(0, 0, 0, .03), inset 0 0 0 1rpx rgba(20, 20, 20, .08); }
.search-wrap { position: relative; margin-bottom: 34rpx; }
.search { height: 104rpx; display: flex; align-items: center; gap: 18rpx; padding: 0 96rpx 0 32rpx; border: 1rpx solid rgba(20, 20, 20, .08); border-radius: 36rpx; color: #9b9b98; background: rgba(255, 255, 255, .9); box-shadow: 0 18rpx 50rpx rgba(20, 20, 20, .04); box-sizing: border-box; font-size: 28rpx; font-weight: 600; }
.search-scan { position: absolute; top: 14rpx; right: 14rpx; width: 76rpx; height: 76rpx; display: flex; align-items: center; justify-content: center; border-radius: 26rpx; background: #f1f1ee; font-size: 34rpx; }
.hero { position: relative; height: 364rpx; overflow: hidden; border-radius: 54rpx; background: #171717; box-shadow: 0 36rpx 100rpx rgba(21, 21, 18, .12); }
.hero-track { height: 100%; position: relative; }
.hero-slide { position: absolute; inset: 0; display: grid; grid-template-columns: minmax(0, 1fr) 264rpx; gap: 12rpx; align-items: center; padding: 44rpx 36rpx 40rpx; opacity: 0; pointer-events: none; transform: scale(1.025); transition: opacity .45s ease, transform .55s ease; overflow: hidden; box-sizing: border-box; }
.hero-slide.active { opacity: 1; pointer-events: auto; transform: scale(1); }
.hero-slide::after { content: ""; position: absolute; width: 380rpx; height: 380rpx; border-radius: 90rpx; right: -116rpx; top: -90rpx; transform: rotate(24deg); background: rgba(255, 255, 255, .08); }
.hero-new { background: radial-gradient(circle at 81% 22%, rgba(255, 124, 82, .82) 0 14%, transparent 15%), linear-gradient(120deg, #181818 10%, #322217 100%); }
.hero-hot { background: radial-gradient(circle at 78% 26%, rgba(223, 247, 90, .94) 0 16%, transparent 17%), linear-gradient(120deg, #0d1822 6%, #18486c 100%); }
.hero-virtual { background: radial-gradient(circle at 82% 22%, rgba(116, 152, 255, .95) 0 16%, transparent 17%), linear-gradient(120deg, #1d1830 6%, #493aa3 100%); }
.hero-copy { position: relative; z-index: 2; align-self: stretch; display: flex; flex-direction: column; justify-content: space-between; }
.hero-eyebrow { display: inline-flex; width: fit-content; padding: 10rpx 16rpx; border-radius: 999rpx; color: rgba(255, 255, 255, .9); background: rgba(255, 255, 255, .14); font-size: 20rpx; font-weight: 800; }
.hero-title { display: block; margin: 16rpx 0 8rpx; white-space: pre-line; color: #fff; font-size: 54rpx; font-weight: 900; letter-spacing: -4rpx; line-height: 1; }
.hero-desc { display: block; color: rgba(255, 255, 255, .68); font-size: 24rpx; font-weight: 600; line-height: 1.45; }
.hero-action { width: fit-content; height: 60rpx; padding: 0 22rpx; border-radius: 999rpx; color: #161616; background: #fff; font-size: 22rpx; font-weight: 800; }
.hero-visual { position: relative; z-index: 2; align-self: end; width: 260rpx; height: 274rpx; display: flex; align-items: center; justify-content: center; border: 1rpx solid rgba(255, 255, 255, .18); border-radius: 80rpx 80rpx 40rpx 40rpx; transform: rotate(-7deg) translateY(16rpx); background: linear-gradient(140deg, rgba(255, 255, 255, .24), rgba(255, 255, 255, .06)); box-shadow: inset 0 2rpx rgba(255, 255, 255, .16), 0 36rpx 60rpx rgba(0, 0, 0, .15); }
.hero-food { font-size: 134rpx; filter: drop-shadow(0 18rpx 16rpx rgba(0, 0, 0, .22)); transform: rotate(7deg); }
.hero-counter { position: absolute; right: 20rpx; bottom: 18rpx; min-width: 110rpx; padding: 12rpx 16rpx; border-radius: 22rpx; color: #141414; background: #dff75a; font-size: 20rpx; font-weight: 900; text-align: center; transform: rotate(7deg); }
.hero-controls { position: absolute; z-index: 5; left: 36rpx; bottom: 22rpx; display: flex; align-items: center; gap: 10rpx; }
.hero-dot { width: 12rpx; height: 12rpx; min-height: 0; border-radius: 50%; background: rgba(255, 255, 255, .42); transition: width .25s ease; }
.hero-dot.active { width: 36rpx; border-radius: 18rpx; background: #fff; }
.section-header { display: flex; align-items: baseline; justify-content: space-between; gap: 24rpx; margin: 46rpx 2rpx 26rpx; }
.section-title { font-size: 40rpx; line-height: 1; font-weight: 900; letter-spacing: -2rpx; }
.section-link { color: #7a7a77; font-size: 24rpx; font-weight: 700; }
.category-grid { display: grid; grid-template-columns: repeat(4, 1fr); row-gap: 28rpx; }
.category-item { display: flex; align-items: center; flex-direction: column; gap: 14rpx; }
.category-icon { width: 116rpx; height: 116rpx; display: flex; align-items: center; justify-content: center; border-radius: 42rpx; background: #fff; box-shadow: inset 0 0 0 1rpx rgba(20, 20, 20, .05), 0 16rpx 32rpx rgba(20, 20, 20, .035); }
.category-item:nth-child(2) .category-icon { background: #fff0e9; }
.category-item:nth-child(3) .category-icon { background: #eff8d5; }
.category-item:nth-child(4) .category-icon { background: #e9efff; }
.category-item:nth-child(5) .category-icon { background: #f8eafd; }
.category-item:nth-child(6) .category-icon { background: #fff6d7; }
.category-item:nth-child(7) .category-icon { background: #e4f4f1; }
.category-name { font-size: 24rpx; line-height: 1; font-weight: 700; letter-spacing: -1rpx; }
.recommendation-heading { margin-top: 52rpx; }
.recommendation-title { display: flex; align-items: center; gap: 16rpx; }
.recommendation-badge { padding: 10rpx 16rpx 8rpx; color: #75400c; border-radius: 16rpx; background: #fff0c3; font-size: 20rpx; font-weight: 900; }
.filter-row { width: calc(100% + 64rpx); margin-left: -32rpx; margin-bottom: 24rpx; white-space: nowrap; }
.filter-content { display: inline-flex; gap: 16rpx; padding: 0 32rpx 4rpx; }
.filter-chip { flex: 0 0 auto; min-height: 64rpx; padding: 0 24rpx; border-radius: 999rpx; color: #73736f; background: #fff; box-shadow: inset 0 0 0 1rpx rgba(20, 20, 20, .08); font-size: 24rpx; font-weight: 700; }
.filter-chip.active { color: #fff; background: #141414; box-shadow: none; }
.store-list { display: grid; gap: 24rpx; }
.route-note { display: flex; align-items: center; gap: 14rpx; margin-top: 24rpx; padding: 18rpx 22rpx; border: 1rpx solid rgba(20, 20, 20, .05); border-radius: 30rpx; color: #63635f; background: rgba(255, 255, 255, .62); font-size: 22rpx; font-weight: 600; line-height: 1.35; }
.route-note strong { color: #141414; font-weight: 800; }
.state-block, .empty-inline { margin-top: 40rpx; padding: 32rpx; border: 1rpx solid rgba(20, 20, 20, .06); border-radius: 32rpx; color: #71716f; background: rgba(255, 255, 255, .72); font-size: 26rpx; text-align: center; }
.error-state { display: flex; align-items: center; justify-content: space-between; text-align: left; }
.error-state button { padding: 14rpx 24rpx; border-radius: 999rpx; color: #fff; background: #141414; font-size: 24rpx; }
@media (max-width: 356px) {
  .hero-slide { grid-template-columns: minmax(0, 1fr) 224rpx; }
  .hero-visual { width: 224rpx; }
  .hero-title { font-size: 48rpx; }
  .category-icon { width: 106rpx; height: 106rpx; }
}
</style>
