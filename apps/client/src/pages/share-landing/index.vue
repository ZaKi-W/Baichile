<script setup lang="ts">
import { getCurrentInstance, ref } from 'vue';
import { onLoad, onShareTimeline } from '@dcloudio/uni-app';
import type { ShareLanding } from '@baichile/api-contract';
import { shareService } from '../../services/shares';
import { useAuthStore } from '../../stores/auth';
import { buildSharePosterModel, type SharePosterModel } from '../../utils/share-poster';

const auth = useAuthStore();
const data = ref<ShareLanding>();
const loading = ref(true);
const token = ref('');
const sharing = ref(false);
const rewardCents = ref(0);
const posterUrl = ref('');
const posterReady = ref(false);
const instance = getCurrentInstance();

onLoad(async (options) => {
  token.value = String(options?.token ?? '');
  sharing.value = options?.share === '1';
  rewardCents.value = Number(options?.reward ?? 0) || 0;
  if (token.value) auth.rememberReferral(token.value);
  try {
    data.value = await shareService.landing(token.value);
    if (data.value.active) await renderPoster(buildSharePosterModel(data.value));
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

onShareTimeline(() => ({
  title: data.value?.title ?? '朋友请你来白吃一顿',
  query: `token=${encodeURIComponent(token.value)}`,
  imageUrl: posterUrl.value || undefined,
}));

async function renderPoster(model: SharePosterModel) {
  posterReady.value = false;
  try {
    const background = await new Promise<string>((resolve, reject) => {
      uni.getImageInfo({
        src: model.background,
        success: (result) => resolve(result.path),
        fail: reject,
      });
    });
    const context = uni.createCanvasContext('sharePoster', instance?.proxy);
    context.drawImage(background, 0, 0, 700, 560);
    context.setTextBaseline('top');
    context.setFillStyle(model.mutedColor);
    context.setFontSize(24);
    context.fillText(model.eyebrow, 52, 54);
    context.setFillStyle(model.textColor);
    context.setFontSize(40);
    context.setTextAlign('left');
    drawWrappedText(context, model.title, 52, 104, 400, 52, 2);
    context.setFontSize(42);
    context.fillText(model.primary, 52, 246);
    context.setFillStyle(model.mutedColor);
    context.setFontSize(25);
    context.fillText(model.secondary, 52, 314);
    drawWrappedText(context, model.detail, 52, 374, 390, 34, 2);
    context.setFillStyle(model.textColor);
    context.setFontSize(22);
    context.fillText('白吃了 · 虚拟外卖，快乐到账', 52, 490);
    await new Promise<void>((resolve) => context.draw(false, () => resolve()));
    posterUrl.value = await new Promise<string>((resolve, reject) => {
      uni.canvasToTempFilePath({
        canvasId: 'sharePoster',
        width: 700,
        height: 560,
        destWidth: 1400,
        destHeight: 1120,
        fileType: 'jpg',
        quality: 0.92,
        success: (result) => resolve(result.tempFilePath),
        fail: reject,
      }, instance?.proxy);
    });
  } catch {
    posterUrl.value = model.background;
  } finally {
    posterReady.value = true;
  }
}

function drawWrappedText(
  context: UniApp.CanvasContext,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const characters = [...text];
  let line = '';
  let lineIndex = 0;
  for (const character of characters) {
    const candidate = line + character;
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line, x, y + lineIndex * lineHeight);
      line = character;
      lineIndex += 1;
      if (lineIndex >= maxLines) return;
    } else {
      line = candidate;
    }
  }
  if (line && lineIndex < maxLines) context.fillText(line, x, y + lineIndex * lineHeight);
}

function start() {
  uni.switchTab({ url: '/pages/profile/index' });
  auth.requestLogin();
}
</script>

<template>
  <view class="landing">
    <canvas canvas-id="sharePoster" class="poster-canvas" />
    <view v-if="loading" class="state">正在拆朋友寄来的空气外卖…</view>
    <view v-else-if="data?.active" class="receipt">
      <image v-if="posterUrl" class="poster-preview" :src="posterUrl" mode="aspectFill" />
      <text class="eyebrow">朋友的虚拟外卖小票</text>
      <text class="title">{{ data.title }}</text>
      <view v-if="data.dishNames.length" class="dishes">
        <text v-for="dish in data.dishNames" :key="dish">{{ dish }}</text>
      </view>
      <view class="numbers">
        <view><strong>¥{{ (data.savedMoneyCents / 100).toFixed(2) }}</strong><text>省下的钱</text></view>
        <view><strong>{{ data.savedCaloriesKcal }}</strong><text>逃过的千卡</text></view>
      </view>
      <text v-if="data.kind === 'achievement'" class="achievement">
        已经成功白吃 {{ data.completedOrderCount }} 顿
      </text>
      <text class="benefit">{{ data.benefitText }}</text>
      <view v-if="sharing" class="share-tip">
        <text v-if="rewardCents">发起奖励 +¥{{ (rewardCents / 100).toFixed(0) }}</text>
        <strong>{{ posterReady ? '点右上角「分享到朋友圈」' : '正在生成朋友圈封面…' }}</strong>
      </view>
      <button class="primary-button" @tap="start">
        领 ¥{{ (data.inviteeRewardCents / 100).toFixed(0) }} 虚拟饭钱
      </button>
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
.receipt, .expired { padding: 48rpx 36rpx; border-radius: 28rpx; background: #fff; box-shadow: 0 18rpx 50rpx rgba(40,35,25,.08); }
.poster-canvas { position: fixed; left: -9999px; top: -9999px; width: 700px; height: 560px; }
.poster-preview { display: block; width: 100%; height: 400rpx; margin-bottom: 30rpx; border-radius: 22rpx; }
.eyebrow { color: #ff6b3d; font-size: 24rpx; font-weight: 700; }
.title { display: block; margin: 22rpx 0 30rpx; color: #1e1d19; font-size: 42rpx; font-weight: 850; line-height: 1.35; }
.dishes { display: flex; flex-direction: column; gap: 12rpx; padding: 24rpx; border-radius: 18rpx; background: #f7f6f2; color: #555149; }
.numbers { display: flex; gap: 18rpx; margin: 30rpx 0; }
.numbers view { display: flex; flex: 1; flex-direction: column; padding: 24rpx; border-radius: 18rpx; background: #22231f; color: #fff; }
.numbers strong { font-size: 34rpx; }.numbers text { margin-top: 8rpx; color: #aaa; font-size: 22rpx; }
.benefit { display: block; margin-bottom: 30rpx; color: #766d60; font-size: 24rpx; line-height: 1.6; }
.achievement { display: block; margin: -12rpx 0 24rpx; color: #ff6b3d; font-weight: 700; text-align: center; }
.share-tip { display: flex; flex-direction: column; gap: 8rpx; margin-bottom: 24rpx; padding: 22rpx; border-radius: 18rpx; color: #9a4b2e; background: #fff0e9; font-size: 24rpx; }
.primary-button { width: 100%; }.state, .expired { text-align: center; color: #777; }
</style>
