<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import type { FlashSaleItem, HomeResponse } from '@baichile/api-contract';
import type { IconKey } from '@baichile/icon-registry';
import { getDeliveryIncidentPhase } from '@baichile/domain';
import AppIcon from '../../components/AppIcon.vue';
import HomeOrderCarousel from '../../components/HomeOrderCarousel.vue';
import StoreCard from '../../components/StoreCard.vue';
import { catalogService } from '../../services/catalog';
import { useAuthStore } from '../../stores/auth';
import { useOrderStore } from '../../stores/orders';
import { createHomeOrderSummary, homeOrderSeenKey } from '../../utils/home-order-summary';

const data = ref<HomeResponse>();
const loading = ref(true);
const error = ref('');
const auth = useAuthStore();
const orders = useOrderStore();
const orderNow = ref(Date.now());
const dismissedOrderIds = ref<string[]>([]);
const sessionOrderIds = ref<string[]>([]);
const activeFilter = ref('综合排序');
const filters = ['综合排序', '距离最近', '评分最高', '预计更快', '免配送费'];
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight ?? 20;
const safeTopStyle = computed(() => ({ paddingTop: `${statusBarHeight + 14}px` }));
let orderTimer: ReturnType<typeof setInterval> | undefined;
const flashSaleSeconds = ref(0);
let flashSaleTimer: ReturnType<typeof setInterval> | undefined;
const settlementRequested = new Set<string>();

const sortedStores = computed(() => {
  const stores = [...(data.value?.stores ?? [])];
  if (activeFilter.value === '距离最近') return stores.sort((a, b) => a.distanceKm - b.distanceKm);
  if (activeFilter.value === '评分最高') return stores.sort((a, b) => b.rating - a.rating);
  if (activeFilter.value === '预计更快') return stores.sort((a, b) => a.virtualDeliveryMinutes - b.virtualDeliveryMinutes);
  if (activeFilter.value === '免配送费') return stores.sort((a, b) => Number(a.deliveryFeeCents > 0) - Number(b.deliveryFeeCents > 0));
  return stores;
});
const flashSaleItems = computed(() => data.value?.flashSaleItems ?? []);

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
const openCategory = (id: string, name: string) => uni.navigateTo({ url: `/pages/category/index?id=${id}&name=${encodeURIComponent(name)}` });
const openStore = (id: string) => uni.navigateTo({ url: `/pages/store/index?id=${id}` });
const openAllCategories = () => {
  const first = data.value?.categories[0];
  if (first) openCategory(first.id, first.name);
};
const flashSaleTime = computed(() => {
  const hours = Math.floor(flashSaleSeconds.value / 3600);
  const minutes = Math.floor((flashSaleSeconds.value % 3600) / 60);
  const seconds = flashSaleSeconds.value % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
});
const failedFlashSaleImageIds = ref<string[]>([]);
const flashSaleImageVisible = (item: FlashSaleItem) => Boolean(item.imageUrl && !failedFlashSaleImageIds.value.includes(item.menuItemId));
const markFlashSaleImageFailed = (id: string) => {
  if (!failedFlashSaleImageIds.value.includes(id)) failedFlashSaleImageIds.value = [...failedFlashSaleImageIds.value, id];
};
function startFlashSaleTimer() {
  stopFlashSaleTimer();
  flashSaleSeconds.value = 10 * 60 * 60 + Math.floor(Math.random() * 8 * 60 * 60);
  flashSaleTimer = setInterval(() => {
    flashSaleSeconds.value = Math.max(0, flashSaleSeconds.value - 1);
  }, 1000);
}
function stopFlashSaleTimer() {
  if (flashSaleTimer) clearInterval(flashSaleTimer);
  flashSaleTimer = undefined;
}
function openFlashSale(item: FlashSaleItem) {
  uni.navigateTo({ url: `/pages/store/index?id=${item.storeId}&flashSaleItemId=${item.menuItemId}` });
}

function seenStorageKey() {
  return homeOrderSeenKey(auth.accountId);
}

function loadDismissedOrderIds() {
  dismissedOrderIds.value = auth.accountId
    ? (uni.getStorageSync(seenStorageKey()) || []) as string[]
    : [];
}

function dismissOrder(orderId: string) {
  sessionOrderIds.value = sessionOrderIds.value.filter((id) => id !== orderId);
  if (!auth.accountId || dismissedOrderIds.value.includes(orderId)) return;
  dismissedOrderIds.value = [...dismissedOrderIds.value, orderId];
  uni.setStorageSync(seenStorageKey(), dismissedOrderIds.value);
}

function openOrder(orderId: string) {
  uni.navigateTo({
    url: `/pages/delivery/index?id=${orderId}`,
  });
}

async function refreshOrders() {
  await orders.load();
  loadDismissedOrderIds();
  sessionOrderIds.value = orders.orders
    .map((order) => createHomeOrderSummary(order, orderNow.value))
    .filter((summary) => !summary.terminal && !dismissedOrderIds.value.includes(summary.order.id))
    .map((summary) => summary.order.id);
}

function refreshFailedIncidentRefunds() {
  const pendingRefunds = orders.orders.filter((order) => (
    order.incident
    && getDeliveryIncidentPhase(order.incident, orderNow.value) === 'failed'
    && order.refundStatus !== 'refunded'
    && !settlementRequested.has(order.id)
  ));
  if (!pendingRefunds.length) return;
  pendingRefunds.forEach((order) => settlementRequested.add(order.id));
  void orders.load();
}

function startOrderTimer() {
  stopOrderTimer();
  orderNow.value = Date.now();
  orderTimer = setInterval(() => {
    orderNow.value = Date.now();
    refreshFailedIncidentRefunds();
  }, 1000);
}

function stopOrderTimer() {
  if (orderTimer) clearInterval(orderTimer);
  orderTimer = undefined;
}

function handleShow() {
  settlementRequested.clear();
  startFlashSaleTimer();
  startOrderTimer();
  void refreshOrders();
}

function handleHide() {
  stopFlashSaleTimer();
  stopOrderTimer();
}

onLoad(() => {
  load();
});
onShow(handleShow);
onHide(handleHide);
onUnload(handleHide);
</script>

<template>
  <view class="home-page">
    <main class="app-main" :style="safeTopStyle">
      <view class="search-wrap">
        <view class="search" @tap="openSearch">
          <AppIcon name="search" :size="18" />
          <text>搜店铺、菜品、口味</text>
        </view>
      </view>

      <HomeOrderCarousel
        :orders="orders.orders"
        :now="orderNow"
        :visible-order-ids="sessionOrderIds"
        @open="openOrder"
        @dismiss="dismissOrder"
      />

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

        <section v-if="flashSaleItems.length" class="flash-sale-section">
          <view class="flash-sale-header">
            <text class="flash-sale-title">🔥 限时秒杀</text>
            <view class="flash-sale-countdown">
              <text>距结束</text>
              <text class="flash-sale-time">{{ flashSaleTime }}</text>
            </view>
          </view>
          <scroll-view class="flash-sale-scroll" scroll-x :show-scrollbar="false">
            <view class="flash-sale-items">
              <button
                v-for="item in flashSaleItems"
                :key="item.menuItemId"
                class="flash-sale-card"
                @tap="openFlashSale(item)"
              >
                <view class="flash-sale-image-wrap">
                  <image
                    v-if="flashSaleImageVisible(item)"
                    class="flash-sale-image"
                    :src="item.imageUrl"
                    mode="aspectFill"
                    @error="markFlashSaleImageFailed(item.menuItemId)"
                  />
                  <text v-else class="flash-sale-fallback">{{ item.name.slice(-1) }}</text>
                </view>
                <text class="flash-sale-name">{{ item.name }}</text>
                <text class="flash-sale-store">{{ item.storeName }}</text>
                <view class="flash-sale-prices">
                  <text class="flash-sale-price">¥{{ (item.flashPriceCents / 100).toFixed(2) }}</text>
                  <text class="flash-sale-original">¥{{ (item.originalPriceCents / 100).toFixed(2) }}</text>
                </view>
                <view class="flash-sale-action">抢</view>
              </button>
            </view>
          </scroll-view>
        </section>

        <section>
          <view class="section-header recommendation-heading">
            <view class="recommendation-title">
              <text class="section-title">附近推荐</text>
              <text class="recommendation-badge">真实口碑</text>
            </view>
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
.search-wrap { position: relative; margin: 4rpx 0 34rpx; }
.search { height: 104rpx; display: flex; align-items: center; gap: 18rpx; padding: 0 32rpx; border: 1rpx solid rgba(20, 20, 20, .08); border-radius: 36rpx; color: #9b9b98; background: rgba(255, 255, 255, .9); box-shadow: 0 18rpx 50rpx rgba(20, 20, 20, .04); box-sizing: border-box; font-size: 28rpx; font-weight: 600; }
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
.flash-sale-section { margin-top: 48rpx; padding: 26rpx 20rpx 22rpx; overflow: hidden; border-radius: 38rpx; color: #fff; background: linear-gradient(135deg, #ff4d19, #ff8a25); box-shadow: 0 24rpx 58rpx rgba(255, 93, 27, .2); }
.flash-sale-header { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; padding: 0 8rpx 20rpx; }
.flash-sale-title { font-size: 38rpx; font-weight: 900; letter-spacing: -2rpx; }
.flash-sale-countdown { display: flex; align-items: center; gap: 10rpx; color: rgba(255, 255, 255, .9); font-size: 23rpx; font-weight: 700; }
.flash-sale-time { padding: 7rpx 12rpx; border-radius: 12rpx; color: #fff; background: rgba(118, 46, 13, .58); font-size: 25rpx; font-weight: 900; letter-spacing: 1rpx; }
.flash-sale-scroll { width: 100%; white-space: nowrap; }
.flash-sale-items { display: inline-flex; gap: 16rpx; }
.flash-sale-card { width: 216rpx; min-height: 352rpx; display: flex; flex: 0 0 auto; flex-direction: column; overflow: hidden; padding: 14rpx 14rpx 16rpx; border-radius: 28rpx; color: #171717; background: #fff; text-align: left; box-sizing: border-box; }
.flash-sale-image-wrap { width: 100%; height: 156rpx; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 19rpx; color: #e86325; background: #fff0e7; }
.flash-sale-image { width: 100%; height: 100%; }
.flash-sale-fallback { font-size: 62rpx; font-weight: 900; }
.flash-sale-name { display: block; overflow: hidden; margin-top: 14rpx; font-size: 27rpx; font-weight: 900; letter-spacing: -1rpx; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.flash-sale-store { display: block; overflow: hidden; margin-top: 6rpx; color: #969693; font-size: 19rpx; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.flash-sale-prices { display: flex; align-items: baseline; gap: 8rpx; margin-top: 12rpx; }
.flash-sale-price { color: #ff3e35; font-size: 29rpx; font-weight: 900; }
.flash-sale-original { color: #a3a3a0; font-size: 19rpx; font-weight: 600; text-decoration: line-through; }
.flash-sale-action { width: 104rpx; margin: auto auto 0; padding: 9rpx 0; border-radius: 999rpx; color: #fff; background: #ff4037; font-size: 28rpx; font-weight: 900; text-align: center; line-height: 1; }
.recommendation-heading { margin-top: 52rpx; }
.recommendation-title { display: flex; align-items: center; gap: 16rpx; }
.recommendation-badge { padding: 10rpx 16rpx 8rpx; color: #75400c; border-radius: 16rpx; background: #fff0c3; font-size: 20rpx; font-weight: 900; }
.filter-row { width: calc(100% + 64rpx); margin-left: -32rpx; margin-bottom: 24rpx; white-space: nowrap; }
.filter-content { display: inline-flex; gap: 16rpx; padding: 0 32rpx 4rpx; }
.filter-chip { flex: 0 0 auto; min-height: 64rpx; display: inline-flex; align-items: center; justify-content: center; padding: 0 24rpx; border-radius: 999rpx; color: #73736f; background: #fff; box-shadow: inset 0 0 0 1rpx rgba(20, 20, 20, .08); font-size: 24rpx; font-weight: 700; line-height: 1; }
.filter-chip.active { color: #fff; background: #141414; box-shadow: none; }
.store-list { display: grid; gap: 24rpx; }
.route-note { display: flex; align-items: center; gap: 14rpx; margin-top: 24rpx; padding: 18rpx 22rpx; border: 1rpx solid rgba(20, 20, 20, .05); border-radius: 30rpx; color: #63635f; background: rgba(255, 255, 255, .62); font-size: 22rpx; font-weight: 600; line-height: 1.35; }
.route-note strong { color: #141414; font-weight: 800; }
.state-block, .empty-inline { margin-top: 40rpx; padding: 32rpx; border: 1rpx solid rgba(20, 20, 20, .06); border-radius: 32rpx; color: #71716f; background: rgba(255, 255, 255, .72); font-size: 26rpx; text-align: center; }
.error-state { display: flex; align-items: center; justify-content: space-between; text-align: left; }
.error-state button { padding: 14rpx 24rpx; border-radius: 999rpx; color: #fff; background: #141414; font-size: 24rpx; }
@media (max-width: 356px) {
  .category-icon { width: 106rpx; height: 106rpx; }
  .flash-sale-card { width: 204rpx; }
  .flash-sale-title { font-size: 34rpx; }
  .flash-sale-countdown { gap: 6rpx; font-size: 20rpx; }
}
</style>
