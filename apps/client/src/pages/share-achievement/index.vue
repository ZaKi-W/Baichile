<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import { useSharePage } from '../../features/share-page';
import { saveGachaPoster, shareCoverPath } from '../../utils/share-poster-canvas';

const page = useSharePage();
const saving = ref(false);
const title = computed(() => page.data.value?.title || '我的白吃升级结果');
const ownerName = computed(() => page.data.value?.identity?.nickname || '匿名白吃选手');
const orders = computed(() => page.data.value?.completedOrderCount || 0);
const paid = computed(() => (page.data.value?.savedMoneyCents || 0) / 100);
const level = computed(() => Math.max(1, Math.ceil(orders.value / 5)));
const progress = computed(() => Math.min(100, (orders.value % 5 || 5) * 20));

onLoad((options) => { void page.load(options); });
onShareTimeline(() => ({ title: title.value, query: page.shareQuery(), imageUrl: shareCoverPath('achievement') }));
onShareAppMessage(() => ({ title: title.value, path: `/pages/share-achievement/index?${page.shareQuery()}`, imageUrl: shareCoverPath('achievement') }));

async function savePoster() {
  const data = page.data.value;
  if (!data || saving.value) return;
  saving.value = true;
  try { await saveGachaPoster({ canvasId: 'achievementPoster', data, kind: 'achievement' }); uni.showToast({ title: '海报已保存', icon: 'success' }); }
  catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '海报保存失败', icon: 'none' }); }
  finally { saving.value = false; }
}
</script>

<template>
  <view class="share-gacha achievement-gacha">
    <view v-if="page.loading.value" class="gacha-state"><text>正在计算你的白吃升级结果</text><view class="gacha-loading-track" /></view>
    <template v-else-if="page.data.value">
      <view v-if="page.data.value.expired" class="gacha-expired">这份升级结果已过期，但仍可围观。</view>
      <view class="gacha-brand-row"><text class="gacha-brand">白吃扭蛋站</text><text class="gacha-ticket">ACHIEVEMENT DROP</text></view>
      <view class="gacha-orbit" />
      <view class="achievement-heading"><view><view class="gacha-section-kicker">白吃等级已刷新</view><text>{{ page.data.value.milestone?.title || '白吃新人进阶中' }}</text></view><view class="level-badge"><small>LEVEL</small><strong>{{ String(level).padStart(2, '0') }}</strong></view></view>
      <view class="achievement-machine gacha-capsule"><view class="achievement-medal"><view class="medal-ring"><text>{{ orders }}</text><small>顿</small></view><text>已撤回的外卖</text></view><view class="achievement-copy"><text>你已把 {{ orders }} 顿外卖<br />摇成了白吃成果。</text><small>{{ page.data.value.milestone?.stamp || '下一枚升级扭蛋正在路上' }}</small></view></view>
      <view class="achievement-progress"><view><text>距离下一等级</text><strong>{{ 5 - (orders % 5 || 5) }} 顿</strong></view><view class="progress-track"><view :style="{ width: `${progress}%` }" /></view></view>
      <view class="achievement-metrics"><view><text>累计实付</text><strong>¥{{ paid.toFixed(2) }}</strong><small>含配送费与打包费</small></view><view><text>躲过热量</text><strong>{{ page.data.value.savedCaloriesKcal }}</strong><small>kcal</small></view></view>
      <view class="achievement-note"><text>继续把“想吃”摇成“没吃”。</text><strong>每一单，都是你给自己抽到的小胜利。</strong></view>
      <view class="achievement-footer"><view class="gacha-identity"><image v-if="page.data.value.identity?.avatarUrl" :src="page.data.value.identity.avatarUrl" aria-label="分享者头像" /><view v-else class="gacha-avatar-fallback"><text>{{ ownerName.slice(0, 1) }}</text></view><text>{{ ownerName }}</text></view><view v-if="page.data.value.miniProgramCodeUrl" class="gacha-qr"><text>查看同款等级</text><image :src="page.data.value.miniProgramCodeUrl" aria-label="小程序码" /></view></view>
    </template>
    <view v-else class="gacha-empty">这份升级结果找不到了。</view>
    <view v-if="page.sharing.value && page.data.value?.active" class="gacha-action-bar"><button class="gacha-secondary" :loading="saving" @tap="savePoster">保存海报</button><button class="gacha-primary" open-type="share">发给朋友</button></view>
    <view v-else-if="page.data.value" class="gacha-visitor"><text>你的第一枚白吃升级扭蛋，正在等你。</text><button class="gacha-primary" @tap="page.enterApp">进入这顿白吃</button></view>
    <canvas canvas-id="achievementPoster" class="gacha-canvas" />
  </view>
</template>

<style scoped lang="scss">
@use '../../styles/share-gacha.scss' as *;
.achievement-gacha{background:#fff8e8}.achievement-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:18rpx;margin-bottom:24rpx}.achievement-heading>view:first-child{min-width:0}.achievement-heading>view:first-child>text{display:block;max-width:520rpx;margin-top:16rpx;font-size:51rpx;font-weight:950;line-height:1.12}.level-badge{flex:0 0 auto;padding:16rpx 18rpx;border:4rpx solid var(--gacha-ink);border-radius:24rpx 8rpx 24rpx 8rpx;background:var(--gacha-yellow);text-align:center}.level-badge small,.level-badge strong{display:block}.level-badge small{font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:16rpx;font-weight:900;letter-spacing:1rpx}.level-badge strong{margin-top:6rpx;font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:39rpx;font-weight:900;line-height:.8}.achievement-machine{display:grid;grid-template-columns:.92fr 1.08fr;min-height:390rpx}.achievement-medal{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32rpx 14rpx 30rpx 28rpx}.medal-ring{display:flex;align-items:flex-end;justify-content:center;width:196rpx;height:196rpx;border:12rpx solid var(--gacha-ink);border-radius:50%;background:var(--gacha-yellow);box-shadow:inset 0 0 0 16rpx #fff8e8}.medal-ring text{font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:76rpx;font-weight:900;line-height:.85}.medal-ring small{margin:0 0 38rpx 6rpx;font-size:19rpx;font-weight:900}.achievement-medal>text{margin-top:20rpx;font-size:21rpx;font-weight:850}.achievement-copy{display:flex;flex-direction:column;justify-content:center;padding:36rpx 28rpx 36rpx 16rpx}.achievement-copy text{font-size:31rpx;font-weight:900;line-height:1.45}.achievement-copy small{margin-top:24rpx;color:var(--gacha-mint);font-size:20rpx;font-weight:900}.achievement-progress{display:flex;align-items:center;gap:18rpx;margin-top:30rpx;padding:20rpx 24rpx;border:4rpx solid var(--gacha-ink);border-radius:28rpx 10rpx 28rpx 10rpx;background:#fff}.achievement-progress>view:first-child{flex:0 0 182rpx}.achievement-progress text,.achievement-progress strong{display:block}.achievement-progress text{font-size:18rpx;font-weight:800}.achievement-progress strong{margin-top:9rpx;font-size:25rpx;font-weight:900}.progress-track{height:22rpx;flex:1;overflow:hidden;border:3rpx solid var(--gacha-ink);border-radius:999rpx;background:#fff8e8}.progress-track view{height:100%;border-radius:inherit;background:var(--gacha-orange);transition:width .25s ease}.achievement-metrics{display:grid;grid-template-columns:1.14fr .86fr;gap:14rpx;margin-top:28rpx}.achievement-metrics view{min-height:160rpx;padding:24rpx;border:4rpx solid var(--gacha-ink);border-radius:30rpx 12rpx 30rpx 12rpx;background:var(--gacha-mint)}.achievement-metrics view:last-child{background:var(--gacha-yellow)}.achievement-metrics text,.achievement-metrics strong,.achievement-metrics small{display:block}.achievement-metrics text{font-size:19rpx;font-weight:800}.achievement-metrics strong{margin-top:17rpx;font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:39rpx;font-weight:900;line-height:1}.achievement-metrics small{margin-top:12rpx;color:rgba(25,23,19,.72);font-size:17rpx}.achievement-note{margin-top:28rpx;padding:28rpx;border-left:12rpx solid var(--gacha-orange);background:#fff}.achievement-note text,.achievement-note strong{display:block}.achievement-note text{font-size:20rpx;font-weight:900}.achievement-note strong{margin-top:11rpx;font-size:25rpx;line-height:1.52}.achievement-footer{display:flex;align-items:flex-end;justify-content:space-between;gap:18rpx;margin-top:28rpx;padding-top:22rpx;border-top:3rpx solid var(--gacha-ink)}@media(max-width:350px){.achievement-heading>view:first-child>text{font-size:45rpx}.achievement-machine{min-height:355rpx}.achievement-copy text{font-size:28rpx}.gacha-qr text{display:none}}
.achievement-heading{margin:28rpx 0 20rpx}.achievement-heading>view:first-child>text{font-size:44rpx}.level-badge{padding:0;border:0;border-radius:0;background:transparent;text-align:right}.level-badge strong{font-size:34rpx}.achievement-machine{min-height:300rpx}.achievement-medal{padding:24rpx 12rpx 24rpx 24rpx}.medal-ring{width:154rpx;height:154rpx;border-width:5rpx;box-shadow:none}.medal-ring text{font-size:58rpx}.medal-ring small{margin:0 0 28rpx 4rpx}.achievement-copy{padding:28rpx 24rpx 28rpx 12rpx}.achievement-copy text{font-size:27rpx}.achievement-copy small{margin-top:16rpx;color:var(--gacha-muted)}.achievement-progress{margin-top:26rpx;padding:18rpx 0;border:0;border-top:1rpx solid var(--gacha-line);border-bottom:1rpx solid var(--gacha-line);border-radius:0;background:transparent}.progress-track{height:12rpx;border:0;background:#e8e2d5}.achievement-metrics{gap:0;margin-top:24rpx;border-top:1rpx solid var(--gacha-line);border-bottom:1rpx solid var(--gacha-line)}.achievement-metrics view,.achievement-metrics view:last-child{min-height:132rpx;padding:20rpx 0;border:0;border-radius:0;background:transparent}.achievement-metrics view+view{padding-left:24rpx;border-left:1rpx solid var(--gacha-line)}.achievement-metrics strong{font-size:34rpx}.achievement-note{margin-top:24rpx;padding:0 0 0 18rpx;border-left:4rpx solid var(--gacha-orange);background:transparent}.achievement-note strong{font-size:23rpx}.achievement-footer{border-top:1rpx solid var(--gacha-line)}
</style>
