<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShareTimeline } from '@dcloudio/uni-app';
import type { ShareLanding } from '@baichile/api-contract';
import { shareService } from '../../services/shares';
import { useAuthStore } from '../../stores/auth';
import { useWalletStore } from '../../stores/wallet';
import { buildSharePosterModel } from '../../utils/share-poster';

const auth = useAuthStore();
const wallet = useWalletStore();
const data = ref<ShareLanding>();
const loading = ref(true);
const token = ref('');
const sharing = ref(false);
const rewardCents = ref(0);
const posterUrl = ref('');
let rewardRequested = false;

onLoad(async (options) => {
  token.value = String(options?.token ?? '');
  sharing.value = options?.share === '1';
  rewardCents.value = Number(options?.reward ?? 0) || 0;
  if (token.value) auth.rememberReferral(token.value);
  try {
    data.value = await shareService.landing(token.value);
    if (data.value.active) {
      posterUrl.value = buildSharePosterModel(data.value).background;
    }
    if (sharing.value) uni.showShareMenu({ menus: ['shareTimeline'] });
  } catch {
    data.value = {
      active: false, dishNames: [], savedMoneyCents: 0, savedCaloriesKcal: 0,
      completedOrderCount: 0, inviteeRewardCents: 0, benefitText: '',
    };
  } finally {
    loading.value = false;
  }
});

onShareTimeline(() => {
  if (sharing.value && token.value && !rewardRequested) {
    rewardRequested = true;
    void shareService.reward(token.value).then((result) => {
      if (!result.granted) return;
      wallet.summary.balanceCents = result.balanceCents;
      uni.showToast({
        title: `分享奖励 +¥${(result.amountCents / 100).toFixed(0)}`,
        icon: 'success',
      });
    }).catch(() => {
      rewardRequested = false;
    });
  }
  return {
    title: data.value?.title ?? '朋友请你来白吃一顿',
    query: `token=${encodeURIComponent(token.value)}`,
    imageUrl: posterUrl.value || undefined,
  };
});

function start() {
  uni.switchTab({ url: '/pages/profile/index' });
  auth.requestLogin();
}
</script>

<template>
  <view class="landing">
    <view v-if="loading" class="state">正在拆朋友寄来的空气外卖…</view>
    <view v-else-if="data?.active" class="receipt">
      <image v-if="posterUrl" class="poster-preview" :src="posterUrl" mode="widthFix" />
      <view v-if="sharing" class="share-tip">
        <text v-if="rewardCents">分享朋友圈即得 ¥{{ (rewardCents / 100).toFixed(0) }} 虚拟饭钱</text>
        <strong>点右上角「分享到朋友圈」</strong>
      </view>
      <view v-if="!sharing" class="claim-panel">
        <text>朋友请你来白吃一顿</text>
        <button class="primary-button" @tap="start">
          领 ¥{{ (data.inviteeRewardCents / 100).toFixed(0) }} 虚拟饭钱
        </button>
      </view>
    </view>
    <view v-else class="expired">
      <text class="title">这份空气外卖已经凉了</text>
      <text>分享已过期或活动暂时休息，仍然可以来白吃一顿。</text>
      <button class="primary-button" @tap="start">进入白吃了</button>
    </view>
  </view>
</template>

<style scoped>
.landing { min-height: 100vh; box-sizing: border-box; padding: 48rpx 28rpx; background: #f4f1e9; }
.receipt { display: flex; flex-direction: column; gap: 24rpx; }
.expired { padding: 48rpx 36rpx; border-radius: 28rpx; background: #fff; box-shadow: 0 18rpx 50rpx rgba(40,35,25,.08); }
.poster-preview { display: block; width: 100%; border-radius: 28rpx; box-shadow: 0 18rpx 50rpx rgba(40,35,25,.12); }
.title { display: block; margin: 22rpx 0 30rpx; color: #1e1d19; font-size: 42rpx; font-weight: 850; line-height: 1.35; }
.share-tip, .claim-panel { display: flex; flex-direction: column; gap: 16rpx; padding: 26rpx; border-radius: 22rpx; background: #fff; box-shadow: 0 10rpx 30rpx rgba(40,35,25,.07); }
.share-tip { color: #9a4b2e; font-size: 25rpx; text-align: center; }
.claim-panel > text { color: #443b32; font-size: 27rpx; font-weight: 700; text-align: center; }
.primary-button { width: 100%; }.state, .expired { text-align: center; color: #777; }
</style>
