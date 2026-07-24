<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import { useSharePage } from '../../features/share-page';
import { catalogService } from '../../services/catalog';
import { saveGachaPoster, shareCoverPath } from '../../utils/share-poster-canvas';
import { shareWebPage } from '../../platform/web-share';

const page = useSharePage();
const saving = ref(false);
const storeAvatarUrl = ref('');
const storeAvatarFailed = ref(false);
const title = computed(() => page.data.value?.title || '我刚刚撤回了这顿外卖');
const money = computed(() => (page.data.value?.savedMoneyCents || 0) / 100);
const lines = computed(() => page.data.value?.orderLines || []);
const dishCount = computed(() => lines.value.length);
const itemCount = computed(() => lines.value.reduce((total, line) => total + line.quantity, 0));
const equivalentSteps = computed(() => Math.round((page.data.value?.savedCaloriesKcal || 0) * 13.4).toLocaleString('zh-CN'));
const storeMark = computed(() => (page.data.value?.storeName || '白').slice(0, 1));

onLoad((options) => { void loadPage(options); });
onShareTimeline(() => ({ title: title.value, query: page.shareQuery(), imageUrl: shareCoverPath('order') }));
onShareAppMessage(() => ({ title: title.value, path: `/pages/share-order/index?${page.shareQuery()}`, imageUrl: shareCoverPath('order') }));
const shareOnWeb = () => shareWebPage(title.value, `/pages/share-order/index?${page.shareQuery()}`);

async function loadPage(options?: Record<string, string | undefined>) {
  await page.load(options);
  const storeName = page.data.value?.storeName;
  if (!storeName) return;
  try {
    const stores = await catalogService.search(storeName);
    const matched = stores.find((store) => store.name === storeName) || stores[0];
    storeAvatarUrl.value = matched?.coverUrl || '';
  } catch {
    storeAvatarUrl.value = '';
  }
}

async function savePoster() {
  const data = page.data.value;
  if (!data || saving.value) return;
  saving.value = true;
  try {
    await saveGachaPoster({ canvasId: 'orderPoster', data, kind: 'order', subjectImageUrl: lines.value[0]?.imageUrl });
    uni.showToast({ title: '海报已保存', icon: 'success' });
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '海报保存失败', icon: 'none' });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <view class="share-gacha order-share">
    <view v-if="page.loading.value" class="gacha-state"><text>正在生成订单战报</text><view class="gacha-loading-track" /></view>
    <template v-else-if="page.data.value">
      <view v-if="page.data.value.expired" class="order-expired">这份订单战报已过期，但仍可围观。</view>

      <view class="order-report">
        <view class="order-hero">
          <view class="order-hero-glow" />
          <view class="order-hero-content">
            <view class="order-store-row">
              <view class="order-store-mark" :class="{ 'order-store-mark--image': storeAvatarUrl && !storeAvatarFailed }"><image v-if="storeAvatarUrl && !storeAvatarFailed" class="order-store-avatar" :src="storeAvatarUrl" mode="aspectFill" aria-label="店铺头像" @error="storeAvatarFailed = true" /><text v-else>{{ storeMark }}</text></view>
              <view class="order-store-copy"><text class="order-store-name">{{ page.data.value.storeName || '神秘小馆' }}</text><text class="order-store-meta">本单共 {{ itemCount }} 件餐品 · 已成功撤回</text></view>
            </view>
            <view class="order-amount-row">
              <view class="order-paid"><text class="order-amount-label">本单实付</text><text class="order-amount-value">¥0.00</text></view>
              <view class="order-saved-tag">白吃了 ¥{{ money.toFixed(2) }}</view>
            </view>
          </view>
        </view>

        <view class="order-section">
          <view class="order-section-head"><text class="order-section-title">这顿吃了什么</text><text class="order-section-count">{{ dishCount }} 件商品</text></view>
          <view v-if="lines.length" class="order-dish-list">
            <view v-for="line in lines" :key="line.menuItemId + line.optionNames.join(',')" class="order-dish">
              <image v-if="line.imageUrl" class="order-dish-image" :src="line.imageUrl" mode="aspectFill" aria-label="菜品图片" />
              <view v-else class="order-dish-placeholder"><text>{{ line.name.slice(0, 1) }}</text></view>
              <view class="order-dish-copy"><text class="order-dish-name">{{ line.name }}</text><text class="order-dish-option">{{ line.optionNames.join(' · ') || '默认规格' }}</text></view>
              <view class="order-dish-price"><text class="order-dish-price-value">¥{{ (line.totalCents / 100).toFixed(2) }}</text><text class="order-dish-quantity">×{{ line.quantity }}</text></view>
            </view>
          </view>
          <view v-else class="order-dish-empty">这顿没留下菜品明细。</view>
          <view class="order-divider" />
          <view class="order-total"><text class="order-total-label">餐品原价</text><text class="order-total-value">¥{{ money.toFixed(2) }}</text></view>
        </view>

        <view class="order-metrics">
          <view class="order-metric order-metric--mint"><text class="order-metric-label">约等于</text><text class="order-metric-value">{{ page.data.value.savedCaloriesKcal }} kcal</text><text class="order-metric-caption">本次少摄入热量</text></view>
          <view class="order-metric order-metric--peach"><text class="order-metric-label">本单战绩</text><text class="order-metric-value">¥{{ money.toFixed(0) }}</text><text class="order-metric-caption">成功撤回的金额</text></view>
          <view class="order-metric order-metric--yellow"><text class="order-metric-label">轻松一下</text><text class="order-metric-value">{{ equivalentSteps }} 步</text><text class="order-metric-caption">约等于步行消耗</text></view>
          <view class="order-metric order-metric--blue"><text class="order-metric-label">订单完成</text><text class="order-metric-value">100%</text><text class="order-metric-caption">本单白吃指数</text></view>
        </view>

        <view class="order-quote"><text class="order-quote-label">今日白吃宣言</text><text class="order-quote-body">下单了，但没吃。</text><text class="order-quote-body">今天这顿，算我赢。</text><text class="order-quote-from">— 来自「这顿白吃」订单战报</text></view>
      </view>
    </template>
    <view v-else class="gacha-empty">这张订单战报找不到了。</view>

    <view v-if="page.sharing.value && page.data.value?.active" class="order-share-actions"><button class="order-save-button" :loading="saving" @tap="savePoster">保存分享图</button><button class="order-share-button" open-type="share" @tap="shareOnWeb">分享订单战报</button></view>
    <view v-else-if="page.data.value" class="order-visitor-actions"><text>这顿没吃，也是一份值得分享的战绩。</text><button class="order-share-button" @tap="page.enterApp">进入这顿白吃</button></view>
    <canvas canvas-id="orderPoster" class="gacha-canvas" />
  </view>
</template>

<style scoped lang="scss">
@use '../../styles/share-gacha.scss' as *;

.order-share {
  min-height: 100dvh;
  padding: 24rpx 24rpx calc(230rpx + env(safe-area-inset-bottom));
  background: #f4f2ec;
}

.order-expired {
  margin: -24rpx -24rpx 24rpx;
  padding: 18rpx 24rpx;
  color: #fff8e8;
  background: #191713;
  font-size: 23rpx;
  font-weight: 700;
  line-height: 1.5;
}

.order-report { display: flex; flex-direction: column; gap: 24rpx; }

.order-hero {
  position: relative;
  min-height: 312rpx;
  overflow: hidden;
  border-radius: 48rpx;
  background: #11110f;
  box-shadow: 0 18rpx 32rpx rgba(25, 23, 19, .13);
}

.order-hero::before {
  position: absolute;
  inset: 0;
  opacity: .22;
  background-image: linear-gradient(rgba(255, 255, 255, .22) 1rpx, transparent 1rpx), linear-gradient(90deg, rgba(255, 255, 255, .22) 1rpx, transparent 1rpx);
  background-size: 24rpx 24rpx;
  content: '';
}

.order-hero-glow {
  position: absolute;
  top: -88rpx;
  right: -44rpx;
  width: 292rpx;
  height: 292rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 212, 0, .62), rgba(255, 113, 69, .12) 58%, transparent 72%);
}

.order-hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 312rpx;
  flex-direction: column;
  padding: 36rpx 32rpx 30rpx;
}

.order-store-row { display: flex; align-items: center; gap: 20rpx; margin-top: 18rpx; }
.order-store-mark { display: flex; width: 88rpx; height: 88rpx; flex: 0 0 88rpx; align-items: center; justify-content: center; overflow: hidden; border-radius: 24rpx; color: #191713; background: #ffd400; font-size: 43rpx; font-weight: 900; }
.order-store-mark--image { background: #fff; }
.order-store-avatar { width: 100%; height: 100%; }
.order-store-copy { display: flex; min-width: 0; flex-direction: column; gap: 8rpx; }
.order-store-name { overflow: hidden; color: #fff; font-size: 35rpx; font-weight: 900; line-height: 1.18; text-overflow: ellipsis; white-space: nowrap; }
.order-store-meta { overflow: hidden; color: rgba(255, 255, 255, .82); font-size: 24rpx; font-weight: 650; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }

.order-amount-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 20rpx; margin-top: auto; }
.order-paid { display: flex; flex-direction: column; gap: 6rpx; }
.order-amount-label { color: rgba(255, 255, 255, .68); font-size: 21rpx; font-weight: 700; }
.order-amount-value { color: #fff; font-family: 'DIN Alternate', 'PingFang SC', sans-serif; font-size: 39rpx; font-weight: 900; line-height: 1; }
.order-saved-tag { flex: 0 0 auto; padding: 17rpx 20rpx; border-radius: 17rpx; color: #191713; background: #ffd400; font-family: 'DIN Alternate', 'PingFang SC', sans-serif; font-size: 24rpx; font-weight: 900; }

.order-section { padding: 30rpx 28rpx 26rpx; border-radius: 38rpx; background: #fff; box-shadow: 0 12rpx 24rpx rgba(25, 23, 19, .06); }
.order-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 18rpx; padding-bottom: 24rpx; }
.order-section-title { color: #191713; font-size: 31rpx; font-weight: 900; line-height: 1.2; }
.order-section-count { color: #4f4a42; font-family: 'DIN Alternate', 'PingFang SC', sans-serif; font-size: 25rpx; font-weight: 800; }
.order-dish-list { display: flex; flex-direction: column; gap: 18rpx; }
.order-dish { display: grid; grid-template-columns: 92rpx minmax(0, 1fr) auto; align-items: center; gap: 18rpx; min-height: 92rpx; }
.order-dish-image, .order-dish-placeholder { width: 92rpx; height: 92rpx; overflow: hidden; border-radius: 22rpx; background: #f3ede1; }
.order-dish-placeholder { display: flex; align-items: center; justify-content: center; color: #191713; background: #ffd400; font-size: 34rpx; font-weight: 900; }
.order-dish-copy, .order-dish-price { display: flex; min-width: 0; flex-direction: column; }
.order-dish-copy { gap: 7rpx; }
.order-dish-name { overflow: hidden; color: #191713; font-size: 29rpx; font-weight: 900; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.order-dish-option { overflow: hidden; color: #514c44; font-size: 22rpx; font-weight: 650; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
.order-dish-price { align-items: flex-end; gap: 7rpx; }
.order-dish-price-value { color: #191713; font-family: 'DIN Alternate', 'PingFang SC', sans-serif; font-size: 27rpx; font-weight: 900; line-height: 1.15; white-space: nowrap; }
.order-dish-quantity { color: #514c44; font-family: 'DIN Alternate', 'PingFang SC', sans-serif; font-size: 22rpx; font-weight: 750; line-height: 1; }
.order-dish-empty { padding: 20rpx 0 12rpx; color: #5a554d; font-size: 24rpx; line-height: 1.5; }
.order-divider { height: 1rpx; margin: 24rpx 0 20rpx; background: #e7e0d5; }
.order-total { display: flex; align-items: baseline; justify-content: space-between; gap: 18rpx; }
.order-total-label { color: #4f4a42; font-size: 23rpx; font-weight: 700; }
.order-total-value { color: #191713; font-family: 'DIN Alternate', 'PingFang SC', sans-serif; font-size: 30rpx; font-weight: 900; }

.order-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18rpx; }
.order-metric { display: flex; min-height: 196rpx; flex-direction: column; padding: 26rpx 24rpx; border-radius: 34rpx; color: #191713; }
.order-metric--mint { background: #c9f4dc; }
.order-metric--peach { background: #ffe0d2; }
.order-metric--yellow { background: #fff09b; }
.order-metric--blue { background: #ddebff; }
.order-metric-label { color: #37352f; font-size: 22rpx; font-weight: 850; line-height: 1.2; }
.order-metric-value { margin-top: 24rpx; color: #191713; font-family: 'DIN Alternate', 'PingFang SC', sans-serif; font-size: 39rpx; font-weight: 900; line-height: 1.04; }
.order-metric-caption { margin-top: auto; padding-top: 16rpx; color: #3e3a33; font-size: 20rpx; font-weight: 700; line-height: 1.3; }

.order-quote { display: flex; flex-direction: column; padding: 32rpx 28rpx; border: 2rpx solid #191713; border-radius: 36rpx 16rpx 36rpx 16rpx; background: #fff8e8; }
.order-quote-label { color: #ff7145; font-size: 21rpx; font-weight: 900; letter-spacing: 2rpx; }
.order-quote-body { margin-top: 12rpx; color: #191713; font-size: 34rpx; font-weight: 900; line-height: 1.25; }
.order-quote-body + .order-quote-body { margin-top: 2rpx; }
.order-quote-from { margin-top: 20rpx; color: #5a554d; font-size: 20rpx; font-weight: 650; }

.order-share-actions, .order-visitor-actions { position: fixed; right: 24rpx; bottom: calc(18rpx + env(safe-area-inset-bottom)); left: 24rpx; z-index: 30; padding: 12rpx; border: 1rpx solid rgba(25, 23, 19, .1); border-radius: 28rpx; background: rgba(244, 242, 236, .98); box-shadow: 0 14rpx 36rpx rgba(25, 23, 19, .16); }
.order-share-actions { display: grid; grid-template-columns: 1fr 1.35fr; gap: 12rpx; }
.order-visitor-actions { padding: 18rpx; }
.order-visitor-actions > text { display: block; margin: 0 0 14rpx; color: #514c44; font-size: 21rpx; font-weight: 650; line-height: 1.4; }
.order-save-button, .order-share-button { min-height: 96rpx; padding: 0 16rpx; border-radius: 20rpx; font-size: 26rpx; font-weight: 850; line-height: 96rpx; white-space: nowrap; }
.order-save-button { color: #191713; background: #fff; }
.order-share-button { color: #191713; background: #ffd400; }
.order-visitor-actions .order-share-button { width: 100%; }
.order-save-button:active, .order-share-button:active { opacity: .82; transform: scale(.985); }

@media (min-width: 760px) {
  .order-share { max-width: 720px; margin: 0 auto; }
  .order-share-actions, .order-visitor-actions { right: auto; left: 50%; width: 672px; transform: translateX(-50%); }
}

@media (max-width: 350px) {
  .order-hero-content { padding-right: 26rpx; padding-left: 26rpx; }
  .order-store-name { font-size: 32rpx; }
  .order-dish { grid-template-columns: 78rpx minmax(0, 1fr) auto; gap: 14rpx; }
  .order-dish-image, .order-dish-placeholder { width: 78rpx; height: 78rpx; border-radius: 18rpx; }
  .order-dish-name { font-size: 26rpx; }
  .order-metric { min-height: 184rpx; padding: 22rpx 20rpx; }
  .order-metric-value { font-size: 35rpx; }
  .order-save-button, .order-share-button { font-size: 23rpx; }
}
</style>
