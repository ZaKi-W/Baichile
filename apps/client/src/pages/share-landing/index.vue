<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import type { ShareLanding } from '@baichile/api-contract';
import { shareService } from '../../services/shares';
import { useAuthStore } from '../../stores/auth';
import { legacyShareTarget } from '../../utils/share-navigation';
import { saveGachaPoster, shareCoverPath } from '../../utils/share-poster-canvas';
import { shareWebPage } from '../../platform/web-share';

const auth = useAuthStore();
const data = ref<ShareLanding>();
const loading = ref(true);
const token = ref('');
const sharing = ref(false);
const saving = ref(false);
const rewardCents = ref(0);
const personaImageUrl = computed(() => data.value?.persona?.imageUrl || '');
const ownerName = computed(() => data.value?.identity?.nickname || '匿名白吃选手');

onLoad(async (options) => {
  token.value = decodeURIComponent(String(options?.token || options?.t || options?.scene || ''));
  sharing.value = options?.share === '1';
  rewardCents.value = Number(options?.reward || 0) || 0;
  try {
    const landing = await shareService.landing(token.value);
    if (landing.persona) {
      const imageUrl = await resolvePersonaImage(landing.persona.id).catch(() => '');
      data.value = { ...landing, persona: { ...landing.persona, imageUrl } };
    } else data.value = landing;
    if (token.value && data.value.kind === 'reward') auth.rememberReferral(token.value);
  } catch {
    data.value = { active: false, dishNames: [], savedMoneyCents: 0, savedCaloriesKcal: 0, completedOrderCount: 0, inviteeRewardCents: 0, benefitText: '' };
  } finally { loading.value = false; }
  const target = legacyShareTarget(data.value?.kind, Boolean(data.value?.easterEgg));
  if (target && token.value) {
    const query = [`token=${encodeURIComponent(token.value)}`, ...(sharing.value ? ['share=1'] : []), ...(rewardCents.value ? [`reward=${rewardCents.value}`] : [])].join('&');
    uni.redirectTo({ url: `${target}?${query}` });
    return;
  }
  if (sharing.value) uni.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
});

function sharePayload() { return { title: data.value?.title || `我的白吃人格是 ${data.value?.persona?.name || '神秘人格'}`, query: `token=${encodeURIComponent(token.value)}`, imageUrl: shareCoverPath('persona') }; }
onShareTimeline(() => sharePayload());
onShareAppMessage(() => ({ ...sharePayload(), path: `/pages/share-landing/index?token=${encodeURIComponent(token.value)}` }));
const shareOnWeb = () => shareWebPage(
  sharePayload().title,
  `/pages/share-landing/index?token=${encodeURIComponent(token.value)}`,
);

async function savePoster() {
  if (!data.value || saving.value) return;
  saving.value = true;
  try { await saveGachaPoster({ canvasId: 'personaPoster', data: data.value, kind: 'persona', subjectImageUrl: personaImageUrl.value }); uni.showToast({ title: '海报已保存', icon: 'success' }); }
  catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '海报保存失败', icon: 'none' }); }
  finally { saving.value = false; }
}

async function resolvePersonaImage(personaId: string): Promise<string> {
  const cloud = typeof wx === 'undefined' ? undefined : wx.cloud;
  if (!cloud) throw new Error('云存储未初始化');
  const fileID = `cloud://cloud1-d8g7o18ula3c12f10/baichile-home/personas/${personaId}.png`;
  const result = await cloud.getTempFileURL({ fileList: [fileID] });
  return result.fileList[0]?.tempFileURL || '';
}

function start() { uni.switchTab({ url: '/pages/profile/index' }); auth.requestLogin(); }
</script>

<template>
  <view class="share-gacha persona-gacha">
    <view v-if="loading" class="gacha-state"><text>正在摇出你的白吃人格</text><view class="gacha-loading-track" /></view>
    <template v-else-if="data && data.kind === 'persona' && data.persona">
      <view v-if="data.expired" class="gacha-expired">这份人格结果已过期，但仍可围观。</view>
      <view class="gacha-brand-row"><text class="gacha-brand">白吃扭蛋站</text><text class="gacha-ticket">PERSONA CAPSULE</text></view>
      <view class="gacha-orbit" />
      <view class="persona-title-row"><view><view class="gacha-section-kicker">你的白吃人格</view><text>{{ data.persona.name }}</text></view><text class="persona-code">{{ data.persona.acronym }}</text></view>
      <view class="persona-machine gacha-capsule"><view class="gacha-machine-window persona-window"><image v-if="personaImageUrl" :src="personaImageUrl" mode="aspectFit" aria-label="白吃人格插画" /><view v-else class="persona-fallback"><text>{{ data.persona.acronym }}</text></view><text class="persona-window-label">TYPE FOUND</text></view><view class="persona-verdict"><text>本次扭蛋结果</text><strong>“{{ data.persona.verdict }}”</strong><small>{{ data.persona.description }}</small></view></view>
      <view class="persona-stats"><view><text>白吃次数</text><strong>{{ data.completedOrderCount }} 顿</strong></view><view><text>累计实付</text><strong>¥{{ (data.savedMoneyCents / 100).toFixed(2) }}</strong></view><view><text>躲过热量</text><strong>{{ data.savedCaloriesKcal }} kcal</strong></view></view>
      <view class="persona-cta"><text>{{ data.persona.callToAction || '来抽你的同款人格' }}</text><strong>每一笔“没吃”都会改变下一枚人格扭蛋。</strong></view>
      <view class="persona-footer"><view class="gacha-identity"><image v-if="data.identity?.avatarUrl" :src="data.identity.avatarUrl" aria-label="分享者头像" /><view v-else class="gacha-avatar-fallback"><text>{{ ownerName.slice(0, 1) }}</text></view><text>{{ ownerName }}</text></view><view v-if="data.miniProgramCodeUrl" class="gacha-qr"><text>抽同款人格</text><image :src="data.miniProgramCodeUrl" aria-label="小程序码" /></view></view>
    </template>
    <view v-else class="gacha-empty">这枚人格扭蛋找不到了。</view>
    <view v-if="sharing && data?.active && data.kind === 'persona'" class="gacha-action-bar"><button class="gacha-secondary" :loading="saving" @tap="savePoster">保存海报</button><button class="gacha-primary" open-type="share" @tap="shareOnWeb">发给朋友</button></view>
    <view v-else-if="data && data.kind === 'persona'" class="gacha-visitor"><text>你的白吃人格扭蛋，正在等你开启。</text><button class="gacha-primary" @tap="start">进入这顿白吃</button></view>
    <canvas canvas-id="personaPoster" class="gacha-canvas" />
  </view>
</template>

<style scoped lang="scss">
@use '../../styles/share-gacha.scss' as *;
.persona-title-row{display:flex;align-items:flex-end;justify-content:space-between;gap:16rpx;margin-bottom:24rpx}.persona-title-row>view:first-child{min-width:0}.persona-title-row>view:first-child>text{display:block;overflow:hidden;max-width:480rpx;margin-top:16rpx;font-size:54rpx;font-weight:950;line-height:1.1;text-overflow:ellipsis;white-space:nowrap}.persona-code{padding-bottom:8rpx;color:var(--gacha-orange);font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:66rpx;font-weight:900;letter-spacing:-3rpx;line-height:.8}.persona-machine{padding:26rpx}.persona-window{height:486rpx;background:var(--gacha-yellow)}.persona-window image,.persona-fallback{width:100%;height:100%}.persona-fallback{display:flex;align-items:center;justify-content:center;color:var(--gacha-ink);font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:98rpx;font-weight:900}.persona-window-label{position:absolute;right:18rpx;bottom:18rpx;z-index:2;padding:10rpx 14rpx;border:3rpx solid var(--gacha-ink);border-radius:16rpx 6rpx 16rpx 6rpx;background:#fff;color:var(--gacha-ink);font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:17rpx;font-weight:900}.persona-verdict{padding:28rpx 4rpx 4rpx}.persona-verdict text,.persona-verdict strong,.persona-verdict small{display:block}.persona-verdict text{color:var(--gacha-mint);font-size:20rpx;font-weight:900}.persona-verdict strong{margin-top:12rpx;font-size:30rpx;font-weight:900;line-height:1.45}.persona-verdict small{margin-top:16rpx;color:var(--gacha-muted);font-size:22rpx;line-height:1.6}.persona-stats{display:grid;grid-template-columns:1fr 1.18fr 1fr;gap:14rpx;margin-top:28rpx}.persona-stats view{min-height:148rpx;padding:20rpx 14rpx;border:3rpx solid var(--gacha-ink);border-radius:28rpx 10rpx 28rpx 10rpx;background:#fff}.persona-stats view:nth-child(2){background:var(--gacha-mint)}.persona-stats text,.persona-stats strong{display:block}.persona-stats text{font-size:17rpx;font-weight:800}.persona-stats strong{margin-top:14rpx;font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:24rpx;font-weight:900;line-height:1.25}.persona-cta{margin-top:28rpx;padding:28rpx;border:3rpx solid var(--gacha-ink);border-radius:30rpx 12rpx 30rpx 12rpx;background:var(--gacha-yellow)}.persona-cta text,.persona-cta strong{display:block}.persona-cta text{font-size:23rpx;font-weight:900}.persona-cta strong{margin-top:11rpx;font-size:23rpx;line-height:1.5}.persona-footer{display:flex;align-items:flex-end;justify-content:space-between;gap:18rpx;margin-top:28rpx;padding-top:22rpx;border-top:3rpx solid var(--gacha-ink)}@media(max-width:350px){.persona-title-row>view:first-child>text{font-size:48rpx}.persona-code{font-size:58rpx}.persona-window{height:448rpx}.gacha-qr text{display:none}}
.persona-title-row{margin:28rpx 0 20rpx}.persona-title-row>view:first-child>text{font-size:46rpx}.persona-code{color:var(--gacha-ink);font-size:54rpx}.persona-machine{padding:16rpx}.persona-window{height:390rpx;background:#f1eee5}.persona-window-label{right:12rpx;bottom:12rpx;padding:0;border:0;border-radius:0;background:transparent;color:var(--gacha-muted)}.persona-verdict{padding:24rpx 8rpx 8rpx}.persona-verdict strong{font-size:27rpx}.persona-stats{gap:0;margin-top:26rpx;border-top:1rpx solid var(--gacha-line);border-bottom:1rpx solid var(--gacha-line)}.persona-stats view,.persona-stats view:nth-child(2){min-height:118rpx;padding:18rpx 10rpx;border:0;border-radius:0;background:transparent}.persona-stats view+view{border-left:1rpx solid var(--gacha-line)}.persona-stats strong{font-size:22rpx}.persona-cta{margin-top:24rpx;padding:0 0 0 18rpx;border:0;border-left:4rpx solid var(--gacha-yellow);border-radius:0;background:transparent}.persona-cta strong{font-size:22rpx}.persona-footer{border-top:1rpx solid var(--gacha-line)}
</style>
