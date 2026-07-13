<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import type { FlashSaleItem, HomeResponse } from '@baichile/api-contract';
import { getDeliveryIncidentPhase } from '@baichile/domain';
import HomeOrderCarousel from '../../components/HomeOrderCarousel.vue';
import StoreCard from '../../components/StoreCard.vue';
import { catalogService } from '../../services/catalog';
import { useAddressStore } from '../../stores/address';
import { useAuthStore } from '../../stores/auth';
import { useOrderStore } from '../../stores/orders';
import { createHomeOrderSummary, homeOrderSeenKey } from '../../utils/home-order-summary';

const data = ref<HomeResponse>();
const loading = ref(true);
const error = ref('');
const auth = useAuthStore();
const address = useAddressStore();
const orders = useOrderStore();
const orderNow = ref(Date.now());
const dismissedOrderIds = ref<string[]>([]);
const sessionOrderIds = ref<string[]>([]);
const activeSort = ref('综合排序');
const activeQuickFilter = ref('全部');
const sortFilters = ['综合排序', '销量最高', '距离最近', '评分最高'];
const quickFilters = ['全部', '免配送费', '30分钟内', '满减优惠'];
const systemInfo = uni.getSystemInfoSync();
const statusBarHeight = systemInfo.statusBarHeight ?? 20;
const menuButtonRect = uni.getMenuButtonBoundingClientRect();
const safeTopStyle = computed(() => ({ paddingTop: `${Math.max(statusBarHeight + 8, menuButtonRect.top)}px` }));
const brandRowStyle = computed(() => ({ paddingRight: `${Math.max(0, systemInfo.windowWidth - menuButtonRect.left + 10)}px` }));
let orderTimer: ReturnType<typeof setInterval> | undefined;
const flashSaleSeconds = ref(0);
let flashSaleTimer: ReturnType<typeof setInterval> | undefined;
const settlementRequested = new Set<string>();
let pageVisible = false;
let primaryLoaded = false;
let secondaryLoad: Promise<void> | undefined;
const STATIC_CDN = 'https://cloud1-d8g7o18ula3c12f10-1318253748.tcloudbaseapp.com/baichile-home';
const categoryImages = [
  `${STATIC_CDN}/categories/burger.png`,
  `${STATIC_CDN}/categories/pizza.png`,
  `${STATIC_CDN}/categories/coffee.png`,
  `${STATIC_CDN}/categories/drink.png`,
  `${STATIC_CDN}/categories/dessert.png`,
  `${STATIC_CDN}/categories/salad.png`,
  `${STATIC_CDN}/categories/hotpot.png`,
  `${STATIC_CDN}/categories/bbq.png`,
];
const featuredCampaignImage = `${STATIC_CDN}/campaigns/featured.png`;
const saleCampaignImage = `${STATIC_CDN}/campaigns/sale.png`;

const sortedStores = computed(() => {
  let stores = [...(data.value?.stores ?? [])];
  if (activeQuickFilter.value === '30分钟内') stores = stores.filter((store) => store.virtualDeliveryMinutes <= 30);
  if (activeQuickFilter.value === '免配送费') stores = stores.filter((store) => store.deliveryFeeCents === 0);
  if (activeQuickFilter.value === '满减优惠') stores = stores.filter((store) => store.tags.some((tag) => tag.includes('减')));
  if (activeSort.value === '销量最高') return stores.sort((a, b) => b.monthlySales - a.monthlySales);
  if (activeSort.value === '距离最近') return stores.sort((a, b) => a.distanceKm - b.distanceKm);
  if (activeSort.value === '评分最高') return stores.sort((a, b) => b.rating - a.rating);
  return stores;
});
const flashSaleItems = computed(() => data.value?.flashSaleItems ?? []);
const featuredStore = computed(() => data.value?.featured[0] ?? data.value?.stores[0]);
const displayAddress = computed(() => {
  const selected = address.selected;
  if (selected) return `${selected.address}${selected.detail ? ` ${selected.detail}` : ''}`;
  return '点击添加收货地址';
});
const categoryImage = (index: number) => categoryImages[index % categoryImages.length];

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await catalogService.home();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载失败';
  } finally {
    loading.value = false;
    primaryLoaded = true;
    if (pageVisible) loadSecondaryData();
  }
}
const openSearch = () => uni.navigateTo({ url: '/pages/search/index' });
const openAddressList = () => uni.navigateTo({ url: '/pages/address-list/index' });
const openCategory = (id: string, name: string) => uni.navigateTo({ url: `/pages/category/index?id=${id}&name=${encodeURIComponent(name)}` });
const openStore = (id: string) => uni.navigateTo({ url: `/pages/store/index?id=${id}` });
const flashSaleTime = computed(() => {
  const hours = Math.floor(flashSaleSeconds.value / 3600);
  const minutes = Math.floor((flashSaleSeconds.value % 3600) / 60);
  const seconds = flashSaleSeconds.value % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
});
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
  pageVisible = true;
  settlementRequested.clear();
  startFlashSaleTimer();
  startOrderTimer();
  if (primaryLoaded) loadSecondaryData();
}

function handleHide() {
  pageVisible = false;
  stopFlashSaleTimer();
  stopOrderTimer();
}

function loadSecondaryData() {
  if (secondaryLoad) return;
  secondaryLoad = Promise.allSettled([
    address.load(),
    refreshOrders(),
  ]).then(() => undefined).finally(() => {
    secondaryLoad = undefined;
  });
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
    <header class="platform-header" :style="safeTopStyle">
      <view class="brand-row" :style="brandRowStyle">
        <view>
          <text class="brand-name">这顿白吃</text>
          <text class="brand-slogan">好吃不贵 · 准时必达</text>
        </view>
      </view>
      <view class="address-row" @tap="openAddressList">
        <image class="location-pin" src="/static/icons/location.svg" mode="aspectFit" />
        <view class="address-copy">
          <text class="address-name">{{ displayAddress }}</text>
        </view>
        <text class="address-arrow">›</text>
        <view class="promise-badge">
          <image class="promise-mark" src="/static/icons/shield.svg" mode="aspectFit" />
          <text class="promise-title">准时保</text>
        </view>
      </view>
      <view class="search" @tap="openSearch">
        <image class="search-glyph" src="/static/icons/search.svg" mode="aspectFit" />
        <text class="search-placeholder">搜附近美食</text>
        <text class="search-action">搜索</text>
      </view>
    </header>

    <main class="app-main">
      <HomeOrderCarousel
        :orders="orders.orders"
        :now="orderNow"
        :visible-order-ids="sessionOrderIds"
        @open="openOrder"
        @dismiss="dismissOrder"
      />

      <view v-if="loading" class="state-block">正在准备附近美食…</view>
      <view v-else-if="error" class="state-block error-state">
        <text>{{ error }}</text>
        <button @tap="load">重新加载</button>
      </view>

      <template v-else-if="data">
        <section class="category-section">
          <view v-if="data.categories.length" class="category-grid">
            <button
              v-for="(category, index) in data.categories.slice(0, 8)"
              :key="category.id"
              class="category-item"
              @tap="openCategory(category.id, category.name)"
            >
              <view class="category-image-wrap">
                <image class="category-image" :src="categoryImage(index)" mode="aspectFill" />
              </view>
              <text class="category-name">{{ category.name }}</text>
            </button>
          </view>
          <view v-else class="empty-inline">分类正在整理中</view>
        </section>

        <section v-if="featuredStore || flashSaleItems.length" class="campaign-grid" :class="{ single: !featuredStore || !flashSaleItems.length }">
          <button v-if="featuredStore" class="campaign-card featured-campaign" @tap="openStore(featuredStore.id)">
            <view class="campaign-copy">
              <text class="campaign-title">今日精选</text>
              <text class="campaign-subtitle">口碑好店 · 放心下单</text>
              <text class="campaign-button">立即去吃</text>
            </view>
            <view class="campaign-image-wrap">
              <image class="campaign-image" :src="featuredCampaignImage" mode="aspectFill" />
            </view>
          </button>
          <button v-if="flashSaleItems.length" class="campaign-card sale-campaign" @tap="openFlashSale(flashSaleItems[0])">
            <view class="campaign-copy">
              <view class="sale-heading">
                <text class="campaign-title sale-title">限时秒杀</text>
                <text class="sale-time">{{ flashSaleTime }}</text>
              </view>
              <text class="campaign-subtitle">{{ flashSaleItems[0].name }}</text>
              <view class="price-row">
                <text class="sale-price">¥{{ (flashSaleItems[0].flashPriceCents / 100).toFixed(1) }}</text>
                <text class="original-price">¥{{ (flashSaleItems[0].originalPriceCents / 100).toFixed(1) }}</text>
              </view>
              <text class="sale-action">马上抢</text>
            </view>
            <view class="campaign-image-wrap">
              <image class="campaign-image" :src="saleCampaignImage" mode="aspectFill" />
            </view>
          </button>
        </section>

        <section class="recommendation-section">
          <scroll-view class="filter-row" scroll-x :show-scrollbar="false">
            <view class="filter-content">
              <button
                v-for="filter in sortFilters"
                :key="filter"
                class="filter-chip"
                :class="{ active: activeSort === filter }"
                @tap="activeSort = filter"
              >{{ filter }}</button>
            </view>
          </scroll-view>
          <scroll-view class="quick-filter-row" scroll-x :show-scrollbar="false">
            <view class="quick-filter-content">
              <button
                v-for="filter in quickFilters"
                :key="filter"
                class="quick-filter-chip"
                :class="{ active: activeQuickFilter === filter }"
                @tap="activeQuickFilter = filter"
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
            <text class="route-label">虚拟外卖演示</text>
            <text>下单后展示模拟派送路线与送达进度</text>
          </view>
        </section>
      </template>
    </main>
  </view>
</template>

<style scoped>
.home-page { min-height: 100vh; color: #171717; background: #f6f6f6; font-family: "PingFang SC", sans-serif; }
.platform-header { position: relative; z-index: 1; padding: 24rpx 28rpx 48rpx; background: #ffd400; box-sizing: border-box; }
.brand-row { min-height: 76rpx; box-sizing: border-box; }
.brand-name { display: block; font-size: 48rpx; line-height: 1; font-weight: 900; letter-spacing: -3rpx; }
.brand-slogan { display: block; margin-top: 10rpx; font-size: 20rpx; font-weight: 700; letter-spacing: 1rpx; }
.promise-badge { display: flex; flex: 0 0 auto; align-items: center; gap: 7rpx; padding: 9rpx 12rpx; border: 2rpx solid rgba(23,23,23,.72); border-radius: 18rpx; background: rgba(255,255,255,.2); }
.promise-mark { width: 28rpx; height: 28rpx; flex: 0 0 auto; }
.promise-title { font-size: 19rpx; font-weight: 900; }
.address-row { min-width: 0; min-height: 66rpx; display: flex; align-items: center; gap: 12rpx; margin-top: 14rpx; }
.location-pin { width: 32rpx; height: 32rpx; flex: 0 0 auto; }
.address-copy { min-width: 0; flex: 1; }
.address-name { display: block; overflow: hidden; font-size: 27rpx; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
.address-arrow { flex: 0 0 auto; font-size: 34rpx; font-weight: 700; }
.search { position: absolute; right: 28rpx; bottom: -38rpx; left: 28rpx; height: 78rpx; display: flex; align-items: center; gap: 14rpx; padding: 7rpx 8rpx 7rpx 22rpx; border: 4rpx solid #171717; border-radius: 38rpx; background: #fff; box-shadow: 0 8rpx 20rpx rgba(23,23,23,.12); box-sizing: border-box; }
.search-glyph { width: 30rpx; height: 30rpx; flex: 0 0 auto; }
.search-placeholder { color: #898989; font-size: 26rpx; }
.search-action { height: 58rpx; display: flex; align-items: center; justify-content: center; margin-left: auto; padding: 0 27rpx; border-radius: 29rpx; color: #171717; background: #ffd400; font-size: 24rpx; font-weight: 900; }
.app-main { padding: 66rpx 24rpx calc(190rpx + env(safe-area-inset-bottom)); }
button { padding: 0; border: 0; color: inherit; background: transparent; line-height: normal; }
button::after { border: 0; }
.category-section { position: relative; padding: 16rpx 6rpx 8rpx; border-radius: 30rpx; background: #fff; }
.category-grid { display: grid; grid-template-columns: repeat(4, 1fr); row-gap: 22rpx; }
.category-item { min-width: 0; display: flex; align-items: center; flex-direction: column; gap: 10rpx; }
.category-image-wrap { width: 118rpx; height: 104rpx; overflow: hidden; border-radius: 34rpx; background: #f7f3e9; }
.category-image { width: 100%; height: 100%; padding: 18rpx; box-sizing: border-box; }
.category-name { max-width: 138rpx; overflow: hidden; font-size: 22rpx; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.campaign-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16rpx; margin-top: 20rpx; }
.campaign-grid.single { grid-template-columns: 1fr; }
.campaign-card { position: relative; min-width: 0; height: 260rpx; display: flex; overflow: hidden; padding: 22rpx 18rpx; border: 1rpx solid #ececec; border-radius: 28rpx; background: #fff; text-align: left; box-sizing: border-box; }
.featured-campaign { background: #fff8df; }
.sale-campaign { background: #fff1ec; }
.campaign-copy { position: relative; z-index: 2; min-width: 0; display: flex; flex: 1; align-items: flex-start; flex-direction: column; }
.campaign-title { display: block; font-size: 30rpx; font-weight: 900; }
.sale-title { color: #f04426; }
.campaign-subtitle { display: block; max-width: 210rpx; overflow: hidden; margin-top: 9rpx; color: #666; font-size: 18rpx; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
.campaign-button { margin-top: 14rpx; padding: 9rpx 16rpx; border-radius: 18rpx; color: #171717; background: #ffd400; font-size: 17rpx; font-weight: 800; }
.campaign-image-wrap { position: absolute; right: -12rpx; bottom: -14rpx; width: 190rpx; height: 148rpx; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 70rpx 0 0 0; color: #171717; background: #f0e5c8; }
.campaign-image { width: 100%; height: 100%; }
.campaign-fallback { font-size: 30rpx; font-weight: 900; }
.sale-heading { display: flex; align-items: center; gap: 8rpx; }
.sale-time { padding: 6rpx 8rpx; border-radius: 8rpx; color: #fff; background: #f04426; font-size: 15rpx; font-weight: 800; }
.price-row { display: flex; align-items: baseline; gap: 8rpx; margin-top: auto; padding: 7rpx 10rpx; border-radius: 12rpx; background: rgba(255,255,255,.92); }
.sale-price { color: #f04426; font-size: 34rpx; font-weight: 900; }
.original-price { color: #999; font-size: 17rpx; text-decoration: line-through; }
.sale-action { position: absolute; z-index: 3; right: 14rpx; bottom: 14rpx; display: block; padding: 10rpx 18rpx; border-radius: 22rpx; color: #fff; background: #f04426 !important; font-size: 18rpx; font-weight: 900; }
.recommendation-section { margin-top: 30rpx; }
.filter-row { width: calc(100% + 48rpx); height: 76rpx; margin-left: -24rpx; white-space: nowrap; border-top: 1rpx solid #ededed; border-bottom: 1rpx solid #ededed; background: #fff; box-sizing: border-box; }
.filter-content { height: 76rpx; display: inline-flex; gap: 10rpx; padding: 0 24rpx; box-sizing: border-box; }
.filter-chip { min-height: 76rpx; display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; padding: 0 20rpx; color: #6c6c6c; font-size: 22rpx; font-weight: 600; }
.filter-chip.active { color: #171717; font-weight: 900; }
.filter-chip.active::after { content: ""; width: 8rpx; height: 8rpx; margin-left: 8rpx; border-radius: 50%; background: #ffd400; }
.quick-filter-row { width: calc(100% + 48rpx); height: 94rpx; margin-left: -24rpx; white-space: nowrap; background: #fff; }
.quick-filter-content { height: 94rpx; display: inline-flex; align-items: center; gap: 14rpx; padding: 0 24rpx; box-sizing: border-box; }
.quick-filter-chip { min-width: 130rpx; min-height: 58rpx; display: inline-flex; align-items: center; justify-content: center; padding: 0 22rpx; border: 1rpx solid #e3e3e3; border-radius: 14rpx; color: #606060; background: #fafafa; font-size: 20rpx; font-weight: 600; }
.quick-filter-chip.active { border-color: #ffd400; color: #171717; background: #ffd400; font-weight: 900; }
.store-list { margin: 0 -4rpx; padding: 0 4rpx; background: #fff; }
.route-note { display: flex; align-items: center; justify-content: center; gap: 12rpx; margin-top: 22rpx; color: #969696; font-size: 18rpx; line-height: 1.4; }
.route-label { color: #6a6a6a; font-weight: 800; }
.state-block, .empty-inline { margin-top: 24rpx; padding: 34rpx 20rpx; border-radius: 24rpx; color: #777; background: #fff; font-size: 24rpx; text-align: center; }
.error-state { display: flex; align-items: center; justify-content: space-between; text-align: left; }
.error-state button { min-height: 58rpx; padding: 0 20rpx; border-radius: 29rpx; color: #171717; background: #ffd400; font-size: 21rpx; font-weight: 800; }
@media (max-width: 356px) {
  .brand-name { font-size: 44rpx; }
  .category-image-wrap { width: 104rpx; height: 94rpx; }
  .campaign-card { height: 244rpx; padding: 18rpx 15rpx; }
  .campaign-image-wrap { width: 170rpx; height: 132rpx; }
  .promise-badge { padding: 8rpx 10rpx; }
}
</style>
