<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import { shareService } from '../../services/shares';
import { shareLandingUrl } from '../../utils/share-navigation';
import { useSharePage } from '../../features/share-page';
import { useAuthStore } from '../../stores/auth';
import { saveGachaPoster, shareCoverPath } from '../../utils/share-poster-canvas';

const auth = useAuthStore();
const page = useSharePage();
const saving = ref(false);
const title = computed(() => page.data.value?.title || '请你来领一枚饭钱胶囊');
const initiatorReward = computed(() => page.rewardCents.value / 100);
const inviteeReward = computed(() => (page.data.value?.inviteeRewardCents || 0) / 100);
const ownerName = computed(() => page.data.value?.identity?.nickname || '一位白吃选手');

onLoad(async (options) => {
  const input = options ?? {};
  const token = String(input.token || input.t || input.scene || '');
  if (!token) {
    if (!auth.accountId) { uni.switchTab({ url: '/pages/profile/index' }); auth.requestLogin(); return; }
    try { const card = await shareService.create({ kind: 'reward', showIdentity: true }); uni.redirectTo({ url: shareLandingUrl(card) }); }
    catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '分享准备失败', icon: 'none' }); uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/profile/index' }) }); }
    return;
  }
  await page.load(input);
});

onShareTimeline(() => { page.rewardShare(); return { title: title.value, query: page.shareQuery(), imageUrl: shareCoverPath('reward') }; });
onShareAppMessage(() => { page.rewardShare(); return { title: title.value, path: `/pages/share-reward/index?${page.shareQuery()}`, imageUrl: shareCoverPath('reward') }; });

async function savePoster() {
  const data = page.data.value;
  if (!data || saving.value) return;
  saving.value = true;
  try { await saveGachaPoster({ canvasId: 'rewardPoster', data, kind: 'reward' }); uni.showToast({ title: '海报已保存', icon: 'success' }); }
  catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '海报保存失败', icon: 'none' }); }
  finally { saving.value = false; }
}
</script>

<template>
  <view class="share-gacha reward-gacha">
    <view v-if="page.loading.value" class="gacha-state"><text>正在准备饭钱扭蛋</text><view class="gacha-loading-track" /></view>
    <template v-else-if="page.data.value">
      <view v-if="page.data.value.expired" class="gacha-expired">这枚饭钱胶囊已过期。</view>
      <view class="gacha-brand-row"><text class="gacha-brand">白吃扭蛋站</text><text class="gacha-ticket">REWARD CAPSULE</text></view>
      <view class="gacha-orbit" />
      <view class="reward-intro"><view><view class="gacha-section-kicker">好友饭钱胶囊</view><text>请朋友来抽一枚，<br />把饭钱一起摇走。</text></view><view class="reward-orb"><view /><view /></view></view>
      <view class="reward-machine gacha-capsule"><view class="reward-money"><text>{{ page.sharing.value ? '分享成功可得' : '首次登录可领' }}</text><strong>¥{{ (page.sharing.value ? initiatorReward : inviteeReward).toFixed(0) }}</strong><small>虚拟饭钱</small></view><view class="reward-copy"><text>一枚给你，<br />一枚给朋友。</text><small>虚拟饭钱仅在应用内使用</small></view></view>
      <view class="reward-flow"><view><text>发起人</text><strong>分享成功后入账</strong></view><view class="flow-link" /><view><text>新朋友</text><strong>首次登录后领取</strong></view></view>
      <view class="reward-note"><text>来自 {{ ownerName }} 的扭蛋邀请</text><strong>{{ page.data.value.benefitText || '点击领取后，一起把空气外卖的快乐摇出来。' }}</strong></view>
      <view class="reward-footer"><view class="gacha-identity"><image v-if="page.data.value.identity?.avatarUrl" :src="page.data.value.identity.avatarUrl" aria-label="邀请发起人头像" /><view v-else class="gacha-avatar-fallback"><text>{{ ownerName.slice(0, 1) }}</text></view><text>{{ ownerName }} 发出</text></view><view v-if="page.data.value.miniProgramCodeUrl" class="gacha-qr"><text>扫码领取</text><image :src="page.data.value.miniProgramCodeUrl" aria-label="小程序码" /></view></view>
    </template>
    <view v-else class="gacha-empty">这枚饭钱胶囊找不到了。</view>
    <view v-if="page.sharing.value && page.data.value?.active" class="gacha-action-bar"><button class="gacha-secondary" :loading="saving" @tap="savePoster">保存海报</button><button class="gacha-primary" open-type="share">发给朋友</button></view>
    <view v-else-if="page.data.value" class="gacha-visitor"><text>{{ page.data.value.benefitText || '朋友请你来抽一枚饭钱胶囊。' }}</text><button class="gacha-primary" @tap="page.enterApp">领 ¥{{ inviteeReward.toFixed(0) }} 虚拟饭钱</button></view>
    <canvas canvas-id="rewardPoster" class="gacha-canvas" />
  </view>
</template>

<style scoped lang="scss">
@use '../../styles/share-gacha.scss' as *;
.reward-intro{display:flex;align-items:flex-end;justify-content:space-between;gap:16rpx;margin:6rpx 0 24rpx}.reward-intro>view:first-child>text{display:block;margin-top:16rpx;font-size:49rpx;font-weight:950;line-height:1.17}.reward-orb{position:relative;width:154rpx;height:150rpx;flex:0 0 154rpx}.reward-orb::before,.reward-orb::after,.reward-orb view{position:absolute;border:4rpx solid var(--gacha-ink);border-radius:50%;content:''}.reward-orb::before{top:4rpx;left:3rpx;width:90rpx;height:90rpx;background:var(--gacha-yellow)}.reward-orb::after{right:4rpx;bottom:4rpx;width:84rpx;height:84rpx;background:var(--gacha-mint)}.reward-orb view:first-child{top:58rpx;left:32rpx;width:76rpx;height:76rpx;background:var(--gacha-orange)}.reward-orb view:last-child{top:26rpx;right:20rpx;width:22rpx;height:22rpx;background:#fff}.reward-machine{display:grid;grid-template-columns:1.1fr .9fr;min-height:330rpx}.reward-money{padding:42rpx 20rpx 34rpx 30rpx}.reward-money text,.reward-money strong,.reward-money small{display:block}.reward-money text{font-size:21rpx;font-weight:850}.reward-money strong{margin-top:18rpx;color:var(--gacha-orange);font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:100rpx;font-weight:900;letter-spacing:-4rpx;line-height:.84}.reward-money small{margin-top:16rpx;color:var(--gacha-muted);font-size:20rpx;font-weight:800}.reward-copy{display:flex;flex-direction:column;justify-content:flex-end;padding:34rpx 24rpx 36rpx 12rpx}.reward-copy text{font-size:29rpx;font-weight:900;line-height:1.48}.reward-copy small{margin-top:22rpx;color:var(--gacha-mint);font-size:19rpx;font-weight:900;line-height:1.45}.reward-flow{display:grid;grid-template-columns:1fr 74rpx 1fr;align-items:center;gap:12rpx;margin-top:28rpx}.reward-flow>view:not(.flow-link){min-height:118rpx;padding:22rpx;border:3rpx solid var(--gacha-ink);border-radius:26rpx 10rpx 26rpx 10rpx;background:#fff}.reward-flow>view:last-child{background:var(--gacha-yellow)}.reward-flow text,.reward-flow strong{display:block}.reward-flow text{font-size:19rpx;font-weight:800}.reward-flow strong{margin-top:12rpx;font-size:22rpx;font-weight:900;line-height:1.35}.flow-link{position:relative;height:4rpx;background:var(--gacha-ink)}.flow-link::before,.flow-link::after{position:absolute;top:-12rpx;width:24rpx;height:24rpx;border:3rpx solid var(--gacha-ink);border-radius:50%;content:''}.flow-link::before{left:0;background:var(--gacha-orange)}.flow-link::after{right:0;background:var(--gacha-mint)}.reward-note{margin-top:28rpx;padding:28rpx;border:3rpx solid var(--gacha-ink);border-radius:30rpx 12rpx 30rpx 12rpx;background:var(--gacha-mint)}.reward-note text,.reward-note strong{display:block}.reward-note text{font-size:20rpx;font-weight:900}.reward-note strong{margin-top:13rpx;font-size:24rpx;line-height:1.55}.reward-footer{display:flex;align-items:flex-end;justify-content:space-between;gap:18rpx;margin-top:28rpx;padding-top:22rpx;border-top:3rpx solid var(--gacha-ink)}@media(max-width:350px){.reward-intro>view:first-child>text{font-size:43rpx}.reward-money strong{font-size:86rpx}.reward-copy text{font-size:26rpx}.gacha-qr text{display:none}}
.reward-intro{margin:28rpx 0 20rpx}.reward-intro>view:first-child>text{font-size:44rpx}.reward-orb{display:none}.reward-machine{min-height:278rpx}.reward-money{padding:32rpx 16rpx 28rpx 26rpx}.reward-money strong{margin-top:14rpx;font-size:78rpx}.reward-copy{padding:28rpx 22rpx 28rpx 10rpx}.reward-copy text{font-size:26rpx}.reward-copy small{margin-top:16rpx;color:var(--gacha-muted)}.reward-flow{grid-template-columns:1fr 1fr;gap:0;margin-top:26rpx;border-top:1rpx solid var(--gacha-line);border-bottom:1rpx solid var(--gacha-line)}.reward-flow>view:not(.flow-link),.reward-flow>view:last-child{min-height:108rpx;padding:20rpx 0;border:0;border-radius:0;background:transparent}.reward-flow>view:last-child{padding-left:24rpx;border-left:1rpx solid var(--gacha-line)}.flow-link{display:none}.reward-note{margin-top:24rpx;padding:0;border:0;border-radius:0;background:transparent}.reward-note strong{font-size:23rpx}.reward-footer{border-top:1rpx solid var(--gacha-line)}
</style>
