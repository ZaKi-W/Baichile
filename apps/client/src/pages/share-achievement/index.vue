<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import { staticAssetUrl } from '../../config/static-cdn';
import { useSharePage } from '../../features/share-page';
import { saveGachaPoster, shareCoverPath } from '../../utils/share-poster-canvas';
import { shareWebPage } from '../../platform/web-share';
import { getSafeMenuButtonRect } from '../../platform/system-ui';

const page = useSharePage();
const saving = ref(false);
const title = computed(() => page.data.value?.title || '我的白吃战绩');
const ownerName = computed(() => page.data.value?.identity?.nickname || '匿名白吃选手');
const orders = computed(() => page.data.value?.completedOrderCount || 0);
const savedMoney = computed(() => (page.data.value?.savedMoneyCents || 0) / 100);
const savedMoneyText = computed(() => formatMoney(savedMoney.value));
const savedCalories = computed(() => page.data.value?.savedCaloriesKcal || 0);
const ticketCount = computed(() => formatTicketCount(savedMoney.value / 512));
const equivalentSteps = computed(() => Math.round(savedCalories.value * 25.8 / 1000) * 1000);
const equivalentStepsText = computed(() => equivalentSteps.value.toLocaleString('zh-CN'));
const levelProgress = computed(() => orders.value ? ((orders.value % 5) || 5) * 20 : 0);
const ownerInitial = computed(() => ownerName.value.slice(0, 1));
const systemInfo = uni.getSystemInfoSync();
const menuButtonRect = getSafeMenuButtonRect(systemInfo);
const headerHeight = Math.max((systemInfo.statusBarHeight || 20) + 8, menuButtonRect.bottom + 8);
const achievementPageStyle = { paddingTop: `${headerHeight}px` };
const achievementHeaderStyle = { height: `${headerHeight}px` };
const shareAsset = (path: string) => staticAssetUrl(`share/${path}`);

onLoad((options) => { void page.load(options); });
onShareTimeline(() => ({ title: title.value, query: page.shareQuery(), imageUrl: shareCoverPath('achievement') }));
onShareAppMessage(() => ({ title: title.value, path: `/pages/share-achievement/index?${page.shareQuery()}`, imageUrl: shareCoverPath('achievement') }));
const shareOnWeb = () => shareWebPage(title.value, `/pages/share-achievement/index?${page.shareQuery()}`);

function goBack() {
  uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/profile/index' }) });
}

function formatMoney(amount: number): string {
  if (Number.isInteger(amount)) return amount.toLocaleString('zh-CN');
  return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTicketCount(value: number): string {
  if (value < 0.1) return '0.1';
  return value >= 10 ? Math.round(value).toLocaleString('zh-CN') : value.toFixed(1).replace(/\.0$/, '');
}

async function savePoster() {
  const data = page.data.value;
  if (!data || saving.value) return;
  saving.value = true;
  try {
    await saveGachaPoster({ canvasId: 'achievementPoster', data, kind: 'achievement' });
    uni.showToast({ title: '战绩已保存', icon: 'success' });
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '战绩保存失败', icon: 'none' });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <view class="share-gacha achievement-share" :style="achievementPageStyle">
    <view class="achievement-header" :style="achievementHeaderStyle">
      <button class="achievement-header-button achievement-back-button" aria-label="返回" @tap="goBack"><image class="achievement-header-icon achievement-back-icon" :src="shareAsset('achievement-icons/back.svg')" mode="aspectFit" /></button>
      <text class="achievement-header-title">晒晒白吃战绩</text>
      <button class="achievement-header-button achievement-notice-button" aria-label="分享战绩" open-type="share" @tap="shareOnWeb"><image class="achievement-header-icon achievement-bell-icon" :src="shareAsset('achievement-icons/bell.svg')" mode="aspectFit" /></button>
    </view>

    <view v-if="page.loading.value" class="gacha-state achievement-state"><text>正在整理你的白吃战绩</text><view class="gacha-loading-track" /></view>

    <template v-else-if="page.data.value">
      <view v-if="page.data.value.expired" class="achievement-expired">这份白吃战绩已过期，但仍可围观。</view>

      <view class="achievement-content">
        <view class="achievement-hero">
          <image class="achievement-hero-mark" :src="shareAsset('achievement-icons/hero-decoration.svg')" mode="aspectFit" />
          <view class="achievement-hero-copy">
            <text class="achievement-hero-kicker">累计省钱</text>
            <view class="achievement-money"><text>¥</text><text>{{ savedMoneyText }}</text></view>
            <text class="achievement-hero-caption">在白吃了，已成功撤回 {{ orders }} 顿外卖</text>
          </view>
        </view>

        <view class="achievement-bento">
          <view class="achievement-compare-card achievement-ticket-card">
            <view class="achievement-icon achievement-icon--ticket"><image :src="shareAsset('achievement-icons/ticket.svg')" mode="aspectFit" /></view>
            <view><text class="achievement-card-label">约等于</text><text class="achievement-card-value">{{ ticketCount }}张</text><text class="achievement-card-caption">迪士尼门票</text></view>
          </view>
          <view class="achievement-compare-card achievement-calorie-card">
            <view class="achievement-icon achievement-icon--calorie"><image :src="shareAsset('achievement-icons/flame.svg')" mode="aspectFit" /></view>
            <view><text class="achievement-card-label">累计省下</text><text class="achievement-card-value">{{ savedCalories.toLocaleString('zh-CN') }}</text><text class="achievement-card-caption">kcal 热量</text></view>
          </view>
          <view class="achievement-walk-card">
            <view class="achievement-walk-icon"><image :src="shareAsset('achievement-icons/walk.svg')" mode="aspectFit" /></view>
            <view class="achievement-walk-copy"><text class="achievement-card-label">健康成就</text><view class="achievement-walk-value"><text>约等于步行</text><text>{{ equivalentStepsText }} 步</text></view><view class="achievement-progress"><view :style="{ width: `${levelProgress}%` }" /></view></view>
          </view>
        </view>

        <view class="achievement-manifesto">
          <view class="achievement-manifesto-heading"><view /><text>白吃宣言</text></view>
          <text class="achievement-manifesto-quote">“省下的不是钱，是通往<text>财富自由</text>的门票。”</text>
          <text class="achievement-manifesto-from">—— 白吃了荣誉会员</text>
          <image class="achievement-quote-mark" :src="shareAsset('achievement-icons/quote.svg')" mode="aspectFit" />
        </view>

        <view class="achievement-social-proof">
          <image :src="shareAsset('achievement-social-proof.jpg')" mode="aspectFill" aria-label="白吃战绩分享配图" />
          <view class="achievement-social-shade" />
          <view class="achievement-social-owner">
            <image v-if="page.data.value.identity?.avatarUrl" class="achievement-social-avatar" :src="page.data.value.identity.avatarUrl" aria-label="分享者头像" />
            <view v-else class="achievement-social-avatar achievement-social-avatar--fallback"><text>{{ ownerInitial }}</text></view>
            <view><text>{{ ownerName }} 刚刚分享了战绩</text><text>就在刚刚</text></view>
          </view>
        </view>
      </view>
    </template>

    <view v-else class="gacha-empty achievement-state">这份白吃战绩找不到了。</view>

    <view v-if="page.sharing.value && page.data.value?.active" class="achievement-actions">
      <button class="achievement-save-button" :loading="saving" @tap="savePoster"><image class="achievement-action-icon" :src="shareAsset('achievement-icons/download.svg')" mode="aspectFit" /><text>保存战绩</text></button>
      <button class="achievement-share-button" open-type="share" @tap="shareOnWeb"><image class="achievement-action-icon achievement-share-action-icon" :src="shareAsset('achievement-icons/share.svg')" mode="aspectFit" /><text>分享朋友圈</text></button>
    </view>
    <view v-else-if="page.data.value" class="achievement-visitor"><text>你的第一份白吃战绩，正在等你。</text><button class="achievement-share-button" @tap="page.enterApp">进入这顿白吃</button></view>
    <canvas canvas-id="achievementPoster" class="gacha-canvas" />
  </view>
</template>

<style scoped lang="scss">
@use '../../styles/share-gacha.scss' as *;

.achievement-share {
  --achievement-ink: #221b00;
  min-height: 100dvh;
  padding: 128rpx 0 calc(176rpx + env(safe-area-inset-bottom));
  color: #1a1c1c;
  background: #f9f9f9;
}

.achievement-header { position: fixed; top: 0; right: 0; left: 0; z-index: 40; display: flex; height: 128rpx; align-items: center; justify-content: space-between; padding: 0 32rpx; border-bottom: 1rpx solid #ececec; background: rgba(249, 249, 249, .98); }
.achievement-header-button { display: flex; width: 80rpx; height: 80rpx; padding: 0; align-items: center; justify-content: center; border: 0; border-radius: 50%; background: transparent; }
.achievement-header-button::after { border: 0; }
.achievement-header-title { color: #1a1c1c; font-size: 32rpx; font-weight: 650; line-height: 1; }
.achievement-header-icon { width: 32rpx; height: 32rpx; }
.achievement-bell-icon { width: 32rpx; height: 40rpx; }

.achievement-state { margin: 0 32rpx; }
.achievement-expired { margin: 24rpx 32rpx 0; padding: 16rpx 20rpx; border-radius: 16rpx; color: #705d00; background: #fff2af; font-size: 22rpx; line-height: 1.45; }
.achievement-content { display: flex; flex-direction: column; gap: 48rpx; padding: 32rpx; }

.achievement-hero { position: relative; min-height: 392rpx; overflow: hidden; border-radius: 24rpx; background: #ffd600; box-shadow: 0 8rpx 40rpx rgba(255, 214, 0, .2); }
.achievement-hero-copy { position: relative; z-index: 1; display: flex; min-height: inherit; flex-direction: column; align-items: center; justify-content: center; padding: 46rpx 36rpx; text-align: center; }
.achievement-hero-kicker { padding: 8rpx 24rpx; border-radius: 999rpx; color: #705d00; background: rgba(249, 249, 249, .5); font-size: 24rpx; font-weight: 600; letter-spacing: .5rpx; }
.achievement-money { display: flex; align-items: baseline; margin-top: 14rpx; color: var(--achievement-ink); font-family: 'DIN Alternate', 'PingFang SC', sans-serif; font-weight: 900; line-height: 1; }
.achievement-money text:first-child { margin-right: 10rpx; font-size: 48rpx; }
.achievement-money text:last-child { font-size: 96rpx; letter-spacing: -4rpx; }
.achievement-hero-caption { margin-top: 16rpx; color: rgba(34, 27, 0, .8); font-size: 26rpx; letter-spacing: .5rpx; }
.achievement-hero-mark { position: absolute; right: -32rpx; bottom: -32rpx; width: 200rpx; height: 204rpx; }

.achievement-bento { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32rpx; }
.achievement-compare-card, .achievement-walk-card, .achievement-manifesto { border-radius: 24rpx; }
.achievement-compare-card { display: flex; min-height: 336rpx; flex-direction: column; justify-content: space-between; padding: 40rpx; background: #fff; box-shadow: 0 8rpx 20rpx rgba(0, 0, 0, .04); }
.achievement-calorie-card { color: #fff; background: var(--achievement-ink); box-shadow: none; }
.achievement-icon { display: flex; width: 80rpx; height: 80rpx; align-items: center; justify-content: center; border-radius: 16rpx; }
.achievement-icon image { width: 44rpx; height: 40rpx; }
.achievement-icon--ticket { color: #a53c12; background: #ffcfb9; }
.achievement-icon--calorie { background: rgba(255, 255, 255, .1); }
.achievement-icon--calorie image { width: 32rpx; height: 38rpx; }
.achievement-card-label, .achievement-card-value, .achievement-card-caption { display: block; }
.achievement-card-label { color: #5f5e5e; font-size: 22rpx; font-weight: 550; line-height: 1.2; }
.achievement-card-value { margin-top: 8rpx; color: #1a1c1c; font-family: 'DIN Alternate', 'PingFang SC', sans-serif; font-size: 48rpx; font-weight: 900; line-height: 1.05; }
.achievement-card-caption { margin-top: 2rpx; color: #4d4632; font-size: 26rpx; font-weight: 550; line-height: 1.3; }
.achievement-calorie-card .achievement-card-label { color: rgba(255, 255, 255, .6); }
.achievement-calorie-card .achievement-card-value { color: #fff; font-size: 44rpx; }
.achievement-calorie-card .achievement-card-caption { color: rgba(255, 255, 255, .8); }
.achievement-walk-card { grid-column: 1 / -1; display: flex; min-height: 284rpx; align-items: center; gap: 48rpx; padding: 48rpx; background: #fff; box-shadow: 0 8rpx 40rpx rgba(0, 0, 0, .04); }
.achievement-walk-icon { display: flex; width: 128rpx; height: 128rpx; flex: 0 0 128rpx; align-items: center; justify-content: center; border-radius: 50%; background: rgba(255, 214, 0, .2); }
.achievement-walk-icon image { width: 48rpx; height: 66rpx; }
.achievement-walk-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.achievement-walk-value { display: flex; margin-top: 8rpx; flex-direction: column; color: #1a1c1c; font-family: 'DIN Alternate', 'PingFang SC', sans-serif; font-size: 46rpx; font-weight: 900; line-height: 1.18; }
.achievement-progress { height: 12rpx; overflow: hidden; margin-top: 16rpx; border-radius: 999rpx; background: #e8e8e8; }
.achievement-progress view { height: 100%; min-width: 8rpx; border-radius: inherit; background: #ffd600; transition: width .25s ease; }

.achievement-manifesto { position: relative; display: flex; min-height: 392rpx; flex-direction: column; padding: 50rpx; overflow: hidden; border: 1rpx solid rgba(255, 255, 255, .3); background: rgba(255, 255, 255, .7); }
.achievement-manifesto-heading { display: flex; align-items: center; gap: 16rpx; color: #705d00; font-size: 26rpx; font-weight: 600; letter-spacing: .5rpx; }
.achievement-manifesto-heading view { width: 8rpx; height: 32rpx; border-radius: 999rpx; background: currentColor; }
.achievement-manifesto-quote { position: relative; z-index: 1; display: block; margin-top: 28rpx; color: #1a1c1c; font-size: 48rpx; font-weight: 500; letter-spacing: -.8rpx; line-height: 1.25; }
.achievement-manifesto-quote text { text-decoration: underline; text-decoration-color: #705d00; text-decoration-thickness: 3rpx; text-underline-offset: 8rpx; }
.achievement-manifesto-from { margin-top: auto; color: #5f5e5e; font-size: 26rpx; }
.achievement-quote-mark { position: absolute; top: 0; right: 0; width: 149rpx; height: 138rpx; }

.achievement-social-proof { position: relative; height: 418rpx; overflow: hidden; border-radius: 24rpx; box-shadow: 0 20rpx 30rpx -10rpx rgba(0, 0, 0, .1); }
.achievement-social-proof > image { width: 100%; height: 100%; }
.achievement-social-shade { position: absolute; right: 0; bottom: 0; left: 0; height: 58%; background: linear-gradient(transparent, rgba(0, 0, 0, .65)); }
.achievement-social-owner { position: absolute; right: 48rpx; bottom: 40rpx; left: 48rpx; display: flex; align-items: center; gap: 24rpx; color: #fff; }
.achievement-social-avatar { width: 88rpx; height: 88rpx; flex: 0 0 88rpx; overflow: hidden; border: 4rpx solid #fff; border-radius: 50%; background: #fff; }
.achievement-social-avatar--fallback { display: flex; align-items: center; justify-content: center; color: #705d00; background: #ffd600; font-family: 'DIN Alternate', 'PingFang SC', sans-serif; font-size: 34rpx; font-weight: 900; }
.achievement-social-owner > view:last-child { display: flex; min-width: 0; flex-direction: column; gap: 4rpx; }
.achievement-social-owner > view:last-child text:first-child { overflow: hidden; font-size: 26rpx; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.achievement-social-owner > view:last-child text:last-child { color: rgba(255, 255, 255, .7); font-size: 22rpx; }

.achievement-actions, .achievement-visitor { position: fixed; right: 0; bottom: 0; left: 0; z-index: 40; display: grid; grid-template-columns: 1fr 1fr; gap: 32rpx; padding: 32rpx calc(32rpx + env(safe-area-inset-right)) calc(32rpx + env(safe-area-inset-bottom)) calc(32rpx + env(safe-area-inset-left)); background: rgba(255, 255, 255, .98); box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, .03); }
.achievement-actions button, .achievement-visitor button { display: flex; min-height: 112rpx; align-items: center; justify-content: center; gap: 16rpx; border-radius: 24rpx; font-size: 26rpx; font-weight: 600; }
.achievement-actions button::after, .achievement-visitor button::after { border: 0; }
.achievement-save-button { color: #fff; background: var(--achievement-ink); }
.achievement-share-button { color: var(--achievement-ink); background: #ffd600; }
.achievement-action-icon { width: 32rpx; height: 32rpx; }
.achievement-share-action-icon { width: 36rpx; height: 40rpx; }
.achievement-visitor { display: block; }
.achievement-visitor > text { display: block; margin-bottom: 18rpx; color: #5f5e5e; font-size: 22rpx; text-align: center; }
.achievement-visitor .achievement-share-button { width: 100%; }

@media (min-width: 760px) {
  .achievement-share { width: min(720px, 100%); margin: 0 auto; }
  .achievement-header, .achievement-actions, .achievement-visitor { right: 50%; left: auto; width: min(720px, 100%); transform: translateX(50%); }
}

@media (max-width: 350px) {
  .achievement-content { gap: 36rpx; padding: 24rpx; }
  .achievement-expired { margin-right: 24rpx; margin-left: 24rpx; }
  .achievement-hero { min-height: 368rpx; }
  .achievement-money text:last-child { font-size: 80rpx; }
  .achievement-compare-card { padding: 28rpx; }
  .achievement-walk-card { gap: 28rpx; padding: 36rpx 28rpx; }
  .achievement-walk-value { font-size: 40rpx; }
  .achievement-manifesto { min-height: 360rpx; padding: 40rpx 34rpx; }
  .achievement-manifesto-quote { font-size: 42rpx; }
  .achievement-actions { gap: 20rpx; padding-right: 24rpx; padding-left: 24rpx; }
  .achievement-actions button { font-size: 24rpx; }
}
</style>
