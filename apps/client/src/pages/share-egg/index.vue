<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import { useSharePage } from '../../features/share-page';
import { orderEggImageUrl } from '../../utils/order-easter-egg';
import { saveGachaPoster, shareCoverPath } from '../../utils/share-poster-canvas';
import { shareWebPage } from '../../platform/web-share';

const page = useSharePage();
const saving = ref(false);
const egg = computed(() => page.data.value?.easterEgg);
const incident = computed(() => egg.value?.id.startsWith('incident-') || false);
const eggId = computed(() => incident.value ? egg.value?.id.slice('incident-'.length) || '' : egg.value?.id || '');
const imageUrl = computed(() => egg.value ? orderEggImageUrl(incident.value ? 'incident' : 'collection', eggId.value) : '');
const title = computed(() => page.data.value?.title || `我抽到了彩蛋：${egg.value?.name || '神秘彩蛋'}`);
const rarityLabel = computed(() => egg.value?.rarity === 'legendary' ? '传说收藏' : egg.value?.rarity === 'rare' ? '稀有收藏' : '普通收藏');
const ownerName = computed(() => page.data.value?.identity?.nickname || '匿名白吃选手');
const capsuleType = computed(() => incident.value ? '配送奇遇扭蛋' : '订单隐藏扭蛋');
const story = computed(() => egg.value?.verdict || '每一顿没吃上的饭，都可能藏着一个故事。');
const shareCopy = computed(() => `我在「这顿白吃」发现了彩蛋：${egg.value?.name || '神秘彩蛋'}\n${story.value}`);

onLoad((options) => { void page.load(options); });
onShareTimeline(() => ({ title: title.value, query: page.shareQuery(), imageUrl: shareCoverPath('order_egg') }));
onShareAppMessage(() => ({ title: title.value, path: `/pages/share-egg/index?${page.shareQuery()}`, imageUrl: shareCoverPath('order_egg') }));
const shareOnWeb = () => shareWebPage(title.value, `/pages/share-egg/index?${page.shareQuery()}`);

function copyShareText() {
  uni.setClipboardData({ data: shareCopy.value, success: () => uni.showToast({ title: '已复制分享文案', icon: 'success' }) });
}

async function savePoster() {
  const data = page.data.value;
  if (!data || saving.value) return;
  saving.value = true;
  try {
    await saveGachaPoster({ canvasId: 'eggPoster', data, kind: 'order_egg', subjectImageUrl: imageUrl.value });
    uni.showToast({ title: '海报已保存', icon: 'success' });
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '海报保存失败', icon: 'none' });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <view class="share-gacha egg-share">
    <view v-if="page.loading.value" class="gacha-state"><text>正在打开今日彩蛋</text><view class="gacha-loading-track" /></view>
    <template v-else-if="page.data.value && egg">
      <view v-if="page.data.value.expired" class="egg-expired">这枚彩蛋已过期，但仍可围观。</view>

      <view class="egg-poster-shell">
        <view class="egg-poster-shadow" />
        <view class="egg-poster"><image :src="imageUrl" mode="aspectFill" aria-label="彩蛋插画" /><text>9:16 COLLECTIBLE</text></view>
      </view>

      <view class="egg-content">
        <view class="egg-eyebrow">今日发现</view>
        <text class="egg-title">{{ egg.name }}</text>
        <text class="egg-story">{{ story }}</text>
        <view class="egg-meta">
          <view><small>彩蛋类型</small><strong>{{ capsuleType }}</strong></view>
          <view><small>收集编号</small><strong>EGG · {{ egg.collectionNumber }}</strong></view>
        </view>
        <view class="egg-divider" />
        <view class="egg-footer-note"><image v-if="page.data.value.identity?.avatarUrl" :src="page.data.value.identity.avatarUrl" aria-label="发现者头像" /><view v-else class="egg-avatar-fallback"><text>{{ ownerName.slice(0, 1) }}</text></view><text>由「{{ ownerName }}」记录<br />{{ rarityLabel }} · 每一顿没吃上的饭，都可能藏着一个故事。</text></view>
      </view>
    </template>
    <view v-else class="gacha-empty">这枚彩蛋找不到了。</view>

    <view v-if="page.sharing.value && page.data.value?.active" class="egg-share-actions"><button class="egg-share-button" open-type="share" @tap="shareOnWeb">分享彩蛋</button><button class="egg-save-button" :loading="saving" @tap="savePoster">保存到相册</button><button class="egg-copy-button" @tap="copyShareText">复制</button></view>
    <view v-else-if="page.data.value" class="egg-visitor-actions"><text>你的订单里，也可能藏着一枚彩蛋。</text><button class="egg-share-button" @tap="page.enterApp">进入这顿白吃</button></view>
    <canvas canvas-id="eggPoster" class="gacha-canvas" />
  </view>
</template>

<style scoped lang="scss">
@use '../../styles/share-gacha.scss' as *;

.egg-share{--gacha-paper:#f4f1ea;min-height:100dvh;padding:24rpx 28rpx calc(194rpx + env(safe-area-inset-bottom));background:radial-gradient(circle at 14% 5%,rgba(255,255,255,.95),transparent 28%),linear-gradient(180deg,#f4f1ea 0%,#ebe6dc 100%)}.egg-expired{margin:-24rpx -28rpx 26rpx;padding:16rpx 28rpx;background:#171714;color:#fff;font-size:21rpx;font-weight:700}.egg-poster-shell{position:relative;width:min(76vw,600rpx);margin:0 auto}.egg-poster-shadow{position:absolute;right:8%;bottom:-24rpx;left:8%;height:72rpx;border-radius:50%;background:rgba(27,23,18,.22);filter:blur(26rpx);transform:scaleY(.55)}.egg-poster{position:relative;z-index:1;overflow:hidden;aspect-ratio:9/16;border:1rpx solid rgba(255,255,255,.78);border-radius:48rpx;background:#1a1a1a;box-shadow:0 24rpx 70rpx rgba(39,34,25,.14)}.egg-poster image{width:100%;height:100%}.egg-poster::after{position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1rpx rgba(255,255,255,.22);content:'';pointer-events:none}.egg-poster text{position:absolute;bottom:20rpx;left:20rpx;z-index:2;padding:9rpx 14rpx;border-radius:999rpx;background:rgba(12,12,12,.58);color:rgba(255,255,255,.92);font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:17rpx;letter-spacing:1rpx}.egg-content{margin-top:46rpx;padding:0 8rpx}.egg-eyebrow{display:flex;align-items:center;gap:12rpx;margin-bottom:12rpx;color:#ff5d3a;font-size:19rpx;font-weight:800;letter-spacing:3rpx}.egg-eyebrow::before{width:30rpx;height:3rpx;border-radius:2rpx;background:currentColor;content:''}.egg-title{display:block;font-size:52rpx;font-weight:900;letter-spacing:-2rpx;line-height:1.08}.egg-story{display:block;margin-top:18rpx;color:#4f4c46;font-size:27rpx;line-height:1.68}.egg-meta{display:grid;grid-template-columns:1fr 1fr;gap:16rpx;margin-top:26rpx}.egg-meta>view{min-height:116rpx;padding:20rpx;border:1rpx solid rgba(23,23,20,.12);border-radius:30rpx;background:rgba(255,255,255,.76)}.egg-meta small,.egg-meta strong{display:block}.egg-meta small{color:#77736b;font-size:17rpx;letter-spacing:2rpx}.egg-meta strong{margin-top:12rpx;font-size:24rpx;font-weight:750;line-height:1.3}.egg-divider{height:1rpx;margin:28rpx 0 22rpx;background:rgba(23,23,20,.12)}.egg-footer-note{display:flex;align-items:center;gap:16rpx;color:#77736b;font-size:21rpx;line-height:1.5}.egg-footer-note image,.egg-avatar-fallback{width:60rpx;height:60rpx;flex:0 0 60rpx;border-radius:50%}.egg-avatar-fallback{display:flex;align-items:center;justify-content:center;background:#ff5d3a;color:#fff;font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:24rpx;font-weight:900}.egg-share-actions,.egg-visitor-actions{position:fixed;right:0;bottom:0;left:0;z-index:30;max-width:720rpx;margin:auto;padding:14rpx 28rpx calc(14rpx + env(safe-area-inset-bottom));border-top:1rpx solid rgba(23,23,20,.1);background:rgba(250,248,243,.96)}.egg-share-actions{display:grid;grid-template-columns:1fr 1fr 92rpx;gap:12rpx}.egg-share-button,.egg-save-button,.egg-copy-button{min-height:94rpx;border:0;border-radius:26rpx;font-size:23rpx;font-weight:800;line-height:94rpx}.egg-share-button{background:#171714;color:#fff}.egg-save-button{background:#ffd400;color:#111}.egg-copy-button{border:1rpx solid rgba(23,23,20,.12);background:#fff;color:#171714;font-size:18rpx}.egg-share-button:active,.egg-save-button:active,.egg-copy-button:active{opacity:.74}.egg-visitor-actions{background:#f4f1ea}.egg-visitor-actions>text{display:block;margin-bottom:12rpx;color:#77736b;font-size:20rpx}.egg-visitor-actions .egg-share-button{width:100%}@media(max-width:350px){.egg-poster-shell{width:72vw}.egg-title{font-size:48rpx}.egg-story{font-size:25rpx}.egg-meta>view{padding:18rpx}.egg-meta strong{font-size:22rpx}}
.egg-share{padding-bottom:calc(32rpx + env(safe-area-inset-bottom))}.egg-title{line-height:1.16;word-break:break-word}.egg-share-actions,.egg-visitor-actions{position:sticky;right:auto;bottom:max(12rpx,env(safe-area-inset-bottom));left:auto;z-index:30;max-width:none;margin:30rpx 0 0;padding:12rpx;border:1rpx solid rgba(23,23,20,.1);border-radius:30rpx;background:rgba(250,248,243,.97);box-shadow:0 16rpx 40rpx rgba(27,23,18,.12)}.egg-share-actions{grid-template-columns:1fr 1fr 92rpx}.egg-copy-button{padding:0;white-space:nowrap}.egg-visitor-actions{padding:18rpx;background:#f4f1ea}
</style>
