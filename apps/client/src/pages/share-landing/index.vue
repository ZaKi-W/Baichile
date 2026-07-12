<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import type { ShareLanding } from '@baichile/api-contract';
import { shareService } from '../../services/shares';
import { useAuthStore } from '../../stores/auth';
import { useWalletStore } from '../../stores/wallet';
import { buildSharePosterModel } from '../../utils/share-poster';

const auth = useAuthStore(); const wallet = useWalletStore();
const data = ref<ShareLanding>(); const loading = ref(true); const token = ref('');
const sharing = ref(false); const saving = ref(false); const rewardCents = ref(0);
const PERSONA_CLOUD_PREFIX = 'cloud://cloud1-d8g7o18ula3c12f10/baichile-home/personas';
let rewardRequested = false;
const poster = computed(() => data.value ? buildSharePosterModel(data.value) : undefined);

onLoad(async (options) => {
  token.value = decodeURIComponent(String(options?.token || options?.t || options?.scene || '')); sharing.value = options?.share === '1';
  rewardCents.value = Number(options?.reward || 0) || 0;
  if (token.value) auth.rememberReferral(token.value);
  try { data.value = await shareService.landing(token.value); }
  catch { data.value = { active: false, dishNames: [], savedMoneyCents: 0, savedCaloriesKcal: 0, completedOrderCount: 0, inviteeRewardCents: 0, benefitText: '' }; }
  finally { loading.value = false; }
  if (sharing.value) uni.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
});

function sharePayload() {
  const persona = data.value?.persona;
  const imageUrl = data.value?.kind === 'achievement' ? '/static/share/achievement-cover.jpg' : data.value?.kind === 'persona' ? persona?.imageUrl : '/static/share/order-cover.jpg';
  const title = data.value?.kind === 'persona' && persona
    ? `我的这顿白吃人格是 ${persona.acronym} · ${persona.name}`
    : data.value?.title || poster.value?.title || '朋友请你来白吃一顿';
  return { title, query: `token=${encodeURIComponent(token.value)}&kind=${data.value?.kind || ''}`, imageUrl };
}
function rewardShare() {
  if (!sharing.value || !token.value || rewardRequested) return;
  rewardRequested = true;
  void shareService.reward(token.value).then((result) => {
    if (!result.granted) return;
    wallet.summary.balanceCents = result.balanceCents;
    uni.showToast({ title: `分享奖励 +¥${(result.amountCents / 100).toFixed(0)}`, icon: 'success' });
  }).catch(() => { rewardRequested = false; });
}
onShareTimeline(() => { rewardShare(); return sharePayload(); });
onShareAppMessage(() => { rewardShare(); return { ...sharePayload(), path: `/pages/share-landing/index?token=${encodeURIComponent(token.value)}&kind=${data.value?.kind || ''}` }; });

async function savePoster() {
  if (!data.value?.miniProgramCodeUrl) { uni.showModal({ title: '小程序码暂未生成', content: '你仍可点击右上角直接分享到朋友圈。', showCancel: false }); return; }
  if (saving.value) return; saving.value = true;
  try {
    await nextTick();
    const qr = await download(data.value.miniProgramCodeUrl);
    const avatar = data.value.identity?.avatarUrl ? await download(data.value.identity.avatarUrl).catch(() => '') : '';
    const character = data.value.persona
      ? await downloadCloudFile(`${PERSONA_CLOUD_PREFIX}/${data.value.persona.id}.png`)
      : '';
    await drawPoster(qr, avatar, character);
    const path = await exportCanvas();
    await saveImage(path);
    uni.showToast({ title: '海报已保存', icon: 'success' });
  } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '海报保存失败', icon: 'none' }); }
  finally { saving.value = false; }
}

function download(url: string): Promise<string> { return new Promise((resolve, reject) => uni.downloadFile({ url, success: (r) => r.statusCode === 200 ? resolve(r.tempFilePath) : reject(new Error('素材下载失败')), fail: reject })); }
async function downloadCloudFile(fileID: string): Promise<string> {
  const cloud = typeof wx === 'undefined' ? undefined : wx.cloud;
  if (!cloud) throw new Error('云存储未初始化');
  try {
    const result = await cloud.downloadFile({ fileID });
    if (!result.tempFilePath) throw new Error('人格素材下载失败');
    return result.tempFilePath;
  } catch {
    throw new Error('人格素材下载失败');
  }
}
function drawPoster(qr: string, avatar: string, character: string): Promise<void> {
  const m = poster.value!; const d = data.value!; const ctx = uni.createCanvasContext('sharePoster');
  if (d.kind === 'persona') return drawPersonaPoster(ctx, qr, avatar, character);
  ctx.setFillStyle(m.background); ctx.fillRect(0, 0, 750, 1334);
  ctx.setFillStyle('#191713'); ctx.fillRect(42, 44, 666, 92); ctx.setFillStyle('#FFD400'); ctx.setFontSize(28); ctx.fillText('这 顿 白 吃 · BAICHILE', 72, 101);
  ctx.setFillStyle(m.accent); ctx.fillRect(42, 176, 18, 210); ctx.setFillStyle('#191713'); ctx.setFontSize(28); ctx.fillText(m.eyebrow, 84, 220);
  ctx.setFontSize(54); wrapText(ctx, m.title, 84, 294, 570, 68, 2);
  ctx.setFillStyle('#FFFFFF'); ctx.fillRect(42, 430, 666, 490);
  if (character) ctx.drawImage(character, 430, 446, 235, 235);
  ctx.setFillStyle('#191713'); ctx.setFontSize(38); wrapText(ctx, m.primary, 76, 500, 590, 52, 3);
  ctx.setFillStyle(m.accent); ctx.setFontSize(30); ctx.fillText(m.secondary, 76, character ? 710 : 670);
  ctx.setFillStyle('#5F584D'); ctx.setFontSize(26); wrapText(ctx, m.detail, 76, character ? 770 : 740, character ? 360 : 560, 42, 3);
  if (d.storeName) { ctx.setFillStyle('#191713'); ctx.setFontSize(24); ctx.fillText(`来自 ${d.storeName}`, 76, 875); }
  ctx.setStrokeStyle(m.accent); ctx.setLineWidth(5); ctx.strokeRect(524, 828, 142, 62); ctx.setFillStyle(m.accent); ctx.setFontSize(24); ctx.fillText(m.stamp, 546, 868);
  if (avatar) { ctx.save(); ctx.beginPath(); ctx.arc(82, 986, 30, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(avatar, 52, 956, 60, 60); ctx.restore(); }
  ctx.setFillStyle('#191713'); ctx.setFontSize(25); ctx.fillText(d.identity?.nickname || '匿名白吃选手', avatar ? 126 : 52, 996);
  ctx.drawImage(qr, 488, 956, 190, 190); ctx.setFontSize(25); ctx.fillText('扫码鉴定你的这顿白吃人格', 52, 1100);
  ctx.setFillStyle('#6C6257'); ctx.setFontSize(22); ctx.fillText('不能提现，但快乐是真的', 52, 1142);
  return new Promise((resolve) => ctx.draw(false, () => setTimeout(resolve, 80)));
}
function drawPersonaPoster(ctx: UniApp.CanvasContext, qr: string, avatar: string, character: string): Promise<void> {
  const d = data.value!; const p = d.persona!;
  ctx.setFillStyle('#F4EEDF'); ctx.fillRect(0, 0, 750, 1334);
  ctx.setFillStyle('#191713'); ctx.fillRect(34, 34, 682, 126);
  ctx.setFillStyle('#FFD400'); ctx.setFontSize(27); ctx.fillText('这顿白吃 · 人格档案', 66, 90);
  ctx.setFillStyle('#FFF8DE'); ctx.setFontSize(20); ctx.fillText('THE BAICHILE TYPE FILE', 66, 128);
  ctx.setFillStyle('#FFD400'); ctx.fillRect(34, 180, 682, 570);
  ctx.setFillStyle('#191713'); ctx.setFontSize(90); ctx.fillText(p.acronym, 66, 292);
  ctx.setFontSize(26); ctx.fillText('NO. ' + String(stablePersonaNumber(p.id)).padStart(2, '0') + ' / 12', 530, 230);
  if (character) ctx.drawImage(character, 190, 285, 370, 370);
  ctx.setFontSize(46); ctx.fillText(p.name, 66, 704);
  ctx.setFillStyle('#FFFFFF'); ctx.fillRect(34, 770, 682, 360);
  ctx.setFillStyle('#191713'); ctx.setFontSize(34); wrapText(ctx, `“${p.verdict}”`, 68, 830, 614, 48, 2);
  ctx.setFillStyle('#2E8B72'); ctx.fillRect(68, 928, 614, 64); ctx.setFillStyle('#FFFFFF'); ctx.setFontSize(25);
  ctx.fillText(`${d.completedOrderCount} 顿`, 96, 969); ctx.fillText(`省 ¥${(d.savedMoneyCents / 100).toFixed(2)}`, 255, 969); ctx.fillText(`${d.savedCaloriesKcal} 千卡`, 478, 969);
  ctx.setFillStyle('#62594E'); ctx.setFontSize(24); wrapText(ctx, p.description, 68, 1040, 590, 38, 2);
  if (avatar) { ctx.save(); ctx.beginPath(); ctx.arc(72, 1208, 28, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(avatar, 44, 1180, 56, 56); ctx.restore(); }
  ctx.setFillStyle('#191713'); ctx.setFontSize(23); ctx.fillText(d.identity?.nickname || '匿名白吃选手', avatar ? 116 : 44, 1217);
  ctx.drawImage(qr, 568, 1154, 128, 128); ctx.setFontSize(20); ctx.fillText('扫码测同款', 446, 1220);
  ctx.setFillStyle('#F04B32'); ctx.fillRect(34, 1290, 682, 10);
  return new Promise((resolve) => ctx.draw(false, () => setTimeout(resolve, 80)));
}
function stablePersonaNumber(id: string): number { return Math.abs(id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 12 + 1; }
function wrapText(ctx: UniApp.CanvasContext, text: string, x: number, y: number, width: number, line: number, max: number) { let row = ''; let n = 0; for (const char of text) { if (ctx.measureText(row + char).width > width) { ctx.fillText(row, x, y + n * line); row = char; n++; if (n >= max) return; } else row += char; } if (row && n < max) ctx.fillText(row, x, y + n * line); }
function exportCanvas(): Promise<string> { return new Promise((resolve, reject) => uni.canvasToTempFilePath({ canvasId: 'sharePoster', width: 750, height: 1334, destWidth: 1125, destHeight: 2001, fileType: 'jpg', quality: 0.92, success: (r) => resolve(r.tempFilePath), fail: reject })); }
function saveImage(path: string): Promise<void> { return new Promise((resolve, reject) => uni.saveImageToPhotosAlbum({ filePath: path, success: () => resolve(), fail: (e) => { if (String(e.errMsg).includes('auth deny')) uni.openSetting({}); reject(new Error('请允许保存到相册后重试')); } })); }
function start() { uni.switchTab({ url: '/pages/profile/index' }); auth.requestLogin(); }
</script>

<template>
  <view class="page">
    <view v-if="loading" class="state">正在打印空气小票…</view>
    <template v-else-if="data && poster">
      <view v-if="data.expired" class="expired">这份分享已过期，但战绩仍可围观。</view>
      <view v-if="data.kind === 'persona' && data.persona" class="persona-poster">
        <view class="persona-brand"><text>这顿白吃 · 人格档案</text><small>THE BAICHILE TYPE FILE</small></view>
        <view class="persona-hero">
          <view class="persona-meta"><text class="persona-acronym">{{ data.persona.acronym }}</text><text class="persona-index">TYPE / 12</text></view>
          <image class="persona-portrait" :src="data.persona.imageUrl" mode="aspectFit" />
          <text class="persona-name">{{ data.persona.name }}</text>
        </view>
        <view class="persona-story">
          <text class="persona-verdict">“{{ data.persona.verdict }}”</text>
          <view class="persona-stats"><text>{{ data.completedOrderCount }} 顿</text><text>省 ¥{{ (data.savedMoneyCents / 100).toFixed(2) }}</text><text>{{ data.savedCaloriesKcal }} 千卡</text></view>
          <text class="persona-description">{{ data.persona.description }}</text>
        </view>
        <view class="persona-footer"><view class="identity"><image v-if="data.identity?.avatarUrl" :src="data.identity.avatarUrl" /><text>{{ data.identity?.nickname || '匿名白吃选手' }}</text></view><view class="persona-qr"><text>扫码测同款</text><image v-if="data.miniProgramCodeUrl" :src="data.miniProgramCodeUrl" /></view></view>
      </view>
      <view v-else class="poster" :style="{ background: poster.background }">
        <view class="brand">这 顿 白 吃 · BAICHILE</view>
        <view class="hero" :style="{ borderColor: poster.accent }"><text class="eyebrow">{{ poster.eyebrow }}</text><text class="title">{{ poster.title }}</text></view>
        <view class="receipt"><image v-if="data.persona?.imageUrl" class="persona-character" :src="data.persona.imageUrl" mode="aspectFit" /><text v-if="data.persona" class="persona-code">{{ data.persona.acronym }}</text><text class="primary">{{ poster.primary }}</text><text class="secondary" :style="{ color: poster.accent }">{{ poster.secondary }}</text><text class="detail">{{ poster.detail }}</text>
          <view v-if="data.orderLines?.length" class="lines"><text v-for="line in data.orderLines" :key="line.menuItemId">{{ line.name }} × {{ line.quantity }}</text></view>
          <text class="stamp" :style="{ color: poster.accent, borderColor: poster.accent }">{{ poster.stamp }}</text>
        </view>
        <view class="identity"><image v-if="data.identity?.avatarUrl" :src="data.identity.avatarUrl" /><text>{{ data.identity?.nickname || '匿名白吃选手' }}</text></view>
        <view class="qr"><image v-if="data.miniProgramCodeUrl" :src="data.miniProgramCodeUrl" /><text>{{ data.miniProgramCodeUrl ? '扫码来白吃' : '右上角进入小程序' }}</text></view>
      </view>
      <view v-if="sharing && data.active" class="actions"><text v-if="rewardCents" class="reward">分享成功可得 ¥{{ (rewardCents / 100).toFixed(0) }} 虚拟饭钱</text><button class="primary-btn" :loading="saving" @tap="savePoster">保存海报到相册</button><button class="timeline-btn" open-type="share">发给朋友</button><text class="tip">发朋友圈：点击右上角 ··· → 分享到朋友圈</text></view>
      <view v-else class="claim"><text>{{ data.benefitText || '朋友请你来白吃一顿' }}</text><button class="primary-btn" @tap="start">{{ data.active ? `领 ¥${(data.inviteeRewardCents / 100).toFixed(0)} 虚拟饭钱` : '进入这顿白吃' }}</button></view>
    </template>
    <view v-else class="state">这张空气小票找不到了。</view>
    <canvas canvas-id="sharePoster" class="canvas" />
  </view>
</template>

<style scoped>
.page{min-height:100vh;padding:24rpx;box-sizing:border-box;background:#e8e1d2;color:#191713}.persona-poster{overflow:hidden;border:3rpx solid #191713;background:#f4eedf;box-shadow:10rpx 10rpx 0 rgba(25,23,19,.16)}.persona-brand{display:flex;flex-direction:column;gap:8rpx;margin:28rpx;padding:24rpx 28rpx;background:#191713;color:#ffd400;font-size:26rpx;font-weight:900;letter-spacing:2rpx}.persona-brand small{color:#fff8de;font-size:17rpx;font-weight:600;letter-spacing:3rpx}.persona-hero{position:relative;height:540rpx;margin:0 28rpx;background:#ffd400}.persona-meta{position:absolute;z-index:2;top:28rpx;left:30rpx;right:30rpx;display:flex;justify-content:space-between;align-items:flex-start}.persona-acronym{font-size:76rpx;font-weight:950;line-height:1}.persona-index{padding-top:10rpx;font-size:20rpx;font-weight:900}.persona-portrait{position:absolute;left:50%;bottom:42rpx;width:390rpx;height:390rpx;transform:translateX(-50%)}.persona-name{position:absolute;left:30rpx;bottom:22rpx;font-size:39rpx;font-weight:950}.persona-story{margin:0 28rpx;padding:34rpx 30rpx;background:#fff}.persona-verdict,.persona-description{display:block}.persona-verdict{min-height:92rpx;font-size:31rpx;font-weight:900;line-height:1.45}.persona-stats{display:flex;justify-content:space-between;margin:26rpx 0;padding:20rpx 18rpx;background:#2e8b72;color:#fff;font-size:21rpx;font-weight:800}.persona-description{color:#62594e;font-size:24rpx;line-height:1.65}.persona-footer{display:flex;align-items:center;justify-content:space-between;margin:0 28rpx 28rpx;padding:22rpx 26rpx;border-top:2rpx solid #191713;background:#fff8de}.persona-footer .identity{margin:0}.persona-qr{display:flex;align-items:center;gap:14rpx;font-size:20rpx;font-weight:800}.persona-qr image{width:96rpx;height:96rpx}.poster{position:relative;min-height:1050rpx;padding:34rpx;border:3rpx solid #191713;box-sizing:border-box;overflow:hidden}.brand{padding:24rpx;background:#191713;color:#ffd400;font-size:24rpx;font-weight:900;letter-spacing:4rpx}.hero{margin-top:42rpx;padding-left:28rpx;border-left:14rpx solid}.eyebrow,.title,.primary,.secondary,.detail,.lines text{display:block}.eyebrow{font-size:24rpx;font-weight:800}.title{margin-top:20rpx;font-size:52rpx;font-weight:950;line-height:1.18}.receipt{position:relative;margin-top:42rpx;padding:42rpx 34rpx 110rpx;background:#fff}.persona-character{position:absolute;right:12rpx;top:8rpx;width:250rpx;height:250rpx}.persona-code{display:block;margin-bottom:16rpx;color:#2e8b72;font-size:50rpx;font-weight:950;letter-spacing:6rpx}.primary{position:relative;max-width:420rpx;font-size:34rpx;font-weight:950;line-height:1.45}.secondary{margin-top:24rpx;font-size:28rpx;font-weight:900}.detail{max-width:410rpx;margin-top:30rpx;color:#62594e;font-size:26rpx;line-height:1.55}.lines{margin-top:28rpx;padding-top:20rpx;border-top:2rpx dashed #bdb4a5;color:#494239;font-size:23rpx;line-height:1.7}.stamp{position:absolute;right:26rpx;bottom:24rpx;padding:12rpx 18rpx;border:4rpx solid;font-size:22rpx;font-weight:900;transform:rotate(-5deg)}.identity{display:flex;align-items:center;gap:14rpx;margin-top:32rpx;font-size:24rpx;font-weight:800}.identity image{width:58rpx;height:58rpx;border-radius:50%}.qr{position:absolute;right:42rpx;bottom:30rpx;display:flex;flex-direction:column;align-items:center;font-size:20rpx}.qr image{width:150rpx;height:150rpx}.actions,.claim{display:flex;flex-direction:column;gap:18rpx;margin-top:24rpx;padding:28rpx;background:#fff}.reward,.tip,.claim>text{text-align:center;font-size:24rpx}.reward{color:#b33a29;font-weight:800}.tip{color:#746b61}.primary-btn,.timeline-btn{width:100%;border-radius:16rpx;font-weight:900}.primary-btn{background:#ffd400;color:#191713}.timeline-btn{border:2rpx solid #191713;background:#fff}.expired{margin-bottom:18rpx;padding:18rpx;background:#191713;color:#fff;text-align:center}.state{padding:120rpx 20rpx;text-align:center;color:#6c6257}.canvas{position:fixed;left:-9999px;top:0;width:750px;height:1334px}
</style>
