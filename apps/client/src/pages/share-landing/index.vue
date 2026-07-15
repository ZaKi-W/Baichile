<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import type { ShareLanding } from '@baichile/api-contract';
import { shareService } from '../../services/shares';
import { useAuthStore } from '../../stores/auth';
import { useWalletStore } from '../../stores/wallet';
import { orderEggImageUrl, orderEggPosterImageUrl } from '../../utils/order-easter-egg';
import { buildSharePosterModel } from '../../utils/share-poster';

const auth = useAuthStore(); const wallet = useWalletStore();
const data = ref<ShareLanding>(); const loading = ref(true); const token = ref('');
const sharing = ref(false); const saving = ref(false); const rewardCents = ref(0);
const PERSONA_CLOUD_PREFIX = 'cloud://cloud1-d8g7o18ula3c12f10/baichile-home/personas';
let rewardRequested = false;
const poster = computed(() => data.value ? buildSharePosterModel(data.value) : undefined);
const easterEggImageUrl = computed(() => {
  const egg = data.value?.easterEgg;
  if (!egg) return '';
  const isIncident = egg.id.startsWith('incident-');
  return orderEggImageUrl(isIncident ? 'incident' : 'collection', isIncident ? egg.id.slice('incident-'.length) : egg.id);
});
const easterEggPosterImageUrl = computed(() => {
  const egg = data.value?.easterEgg;
  if (!egg) return '';
  const isIncident = egg.id.startsWith('incident-');
  return orderEggPosterImageUrl(isIncident ? 'incident' : 'collection', isIncident ? egg.id.slice('incident-'.length) : egg.id);
});
const eggCard = computed(() => {
  const egg = data.value?.easterEgg;
  if (!egg) return undefined;
  const isDeliveryIncident = egg.id.startsWith('incident-');
  return {
    skin: `egg-card--${egg.rarity}`,
    archiveText: isDeliveryIncident
      ? '这份外卖在虚拟配送途中主动偏离了预定航线，并被收录进 AIR FOOD 的异常事件档案。'
      : '这份空气外卖凭借异常表现被图鉴捕捉，现已成为虚拟外卖世界里的正式收藏。',
  };
});

onLoad(async (options) => {
  token.value = decodeURIComponent(String(options?.token || options?.t || options?.scene || '')); sharing.value = options?.share === '1';
  rewardCents.value = Number(options?.reward || 0) || 0;
  if (token.value) auth.rememberReferral(token.value);
  try {
    const landing = await shareService.landing(token.value);
    if (landing.persona) {
      const imageUrl = await resolvePersonaImage(landing.persona.id).catch(() => '');
      data.value = { ...landing, persona: { ...landing.persona, imageUrl } };
    } else data.value = landing;
  }
  catch { data.value = { active: false, dishNames: [], savedMoneyCents: 0, savedCaloriesKcal: 0, completedOrderCount: 0, inviteeRewardCents: 0, benefitText: '' }; }
  finally { loading.value = false; }
  if (sharing.value) uni.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
});

function sharePayload() {
  const persona = data.value?.persona;
  const egg = data.value?.easterEgg;
  const imageUrl = egg
    ? easterEggPosterImageUrl.value
    : data.value?.kind === 'achievement'
      ? '/static/share/achievement-cover.jpg'
      : data.value?.kind === 'persona'
        ? persona?.imageUrl || '/static/share/order-cover.jpg'
        : '/static/share/order-cover.jpg';
  const title = egg
    ? `我发现了${poster.value?.eyebrow || '彩蛋'}：${poster.value?.title || egg.name}`
    : data.value?.kind === 'persona' && persona
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
    const character = data.value.persona ? await downloadCloudFile(`${PERSONA_CLOUD_PREFIX}/${data.value.persona.id}.png`) : '';
    const eggImage = data.value.easterEgg ? easterEggPosterImageUrl.value : '';
    await drawPoster(qr, avatar, character, eggImage);
    await saveImage(await exportCanvas());
    uni.showToast({ title: '海报已保存', icon: 'success' });
  } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '海报保存失败', icon: 'none' }); }
  finally { saving.value = false; }
}

function download(url: string): Promise<string> { return new Promise((resolve, reject) => uni.downloadFile({ url, success: (r) => r.statusCode === 200 ? resolve(r.tempFilePath) : reject(new Error('素材下载失败')), fail: reject })); }
async function resolvePersonaImage(personaId: string): Promise<string> {
  const cloud = typeof wx === 'undefined' ? undefined : wx.cloud;
  if (!cloud) throw new Error('云存储未初始化');
  const fileID = `${PERSONA_CLOUD_PREFIX}/${personaId}.png`;
  const result = await cloud.getTempFileURL({ fileList: [fileID] });
  return result.fileList[0]?.tempFileURL || '';
}
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
function drawPoster(qr: string, avatar: string, character: string, eggImage: string): Promise<void> {
  const m = poster.value!; const d = data.value!; const ctx = uni.createCanvasContext('sharePoster');
  if (d.kind === 'persona') return drawPersonaPoster(ctx, qr, avatar, character);
  if (d.easterEgg && eggCard.value) return drawEggPoster(ctx, qr, avatar, eggImage);
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
function drawEggPoster(ctx: UniApp.CanvasContext, qr: string, avatar: string, eggImage: string): Promise<void> {
  const m = poster.value!; const d = data.value!; const card = eggCard.value!;
  ctx.setFillStyle('#12110E'); ctx.fillRect(0, 0, 750, 1334);
  ctx.setFillStyle('#FFF8DE'); ctx.fillRect(28, 28, 694, 1278);
  ctx.setStrokeStyle(m.accent); ctx.setLineWidth(7); ctx.strokeRect(42, 42, 666, 1250);
  ctx.setFillStyle(m.accent); ctx.fillRect(62, 66, 14, 72);
  ctx.setFillStyle('#62594E'); ctx.setFontSize(19); ctx.fillText(`AIR FOOD COLLECTION · ARCHIVE #${d.easterEgg!.collectionNumber}`, 96, 98);
  ctx.setFillStyle('#191713'); ctx.fillRect(62, 158, 626, 572);
  ctx.setFillStyle('#F4EEDF'); ctx.fillRect(78, 174, 594, 540);
  if (eggImage) { ctx.save(); ctx.beginPath(); ctx.rect(78, 174, 594, 540); ctx.clip(); ctx.drawImage(eggImage, 51, 131, 647, 612); ctx.restore(); }
  ctx.setFillStyle('#191713'); ctx.fillRect(62, 758, 626, 150);
  ctx.setFillStyle('#D6A94D'); ctx.setFontSize(18); ctx.fillText('EVENT DATA', 86, 794);
  ctx.setFillStyle('#FFF8DE'); ctx.setFontSize(20); ctx.fillText('虚拟消费', 86, 836); ctx.fillText('逃避热量', 382, 836);
  ctx.setFillStyle('#D6A94D'); ctx.setFontSize(31); ctx.fillText(`¥${(d.savedMoneyCents / 100).toFixed(2)}`, 86, 880); ctx.fillText(`${d.savedCaloriesKcal} kcal`, 382, 880);
  ctx.setFillStyle('#62594E'); ctx.setFontSize(18); ctx.fillText('EVENT ARCHIVE', 62, 958);
  ctx.setFillStyle('#191713'); ctx.setFontSize(24); wrapText(ctx, card.archiveText, 62, 998, 620, 34, 2);
  if (avatar) { ctx.save(); ctx.beginPath(); ctx.arc(90, 1204, 24, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(avatar, 66, 1180, 48, 48); ctx.restore(); }
  ctx.setFillStyle('#191713'); ctx.setFontSize(19); ctx.fillText(d.identity?.nickname || '匿名白吃选手', avatar ? 126 : 62, 1210);
  ctx.drawImage(qr, 584, 1164, 80, 80);
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
    <view v-if="loading" class="state">正在调取彩蛋档案…</view>
    <template v-else-if="data && poster">
      <view v-if="data.expired" class="expired">这份分享已过期，但战绩仍可围观。</view>
      <view v-if="data.kind === 'persona' && data.persona" class="persona-poster">
        <view class="persona-brand"><text>这顿白吃 · 人格档案</text><small>THE BAICHILE TYPE FILE</small></view>
        <view class="persona-hero"><view class="persona-meta"><text class="persona-acronym">{{ data.persona.acronym }}</text><text class="persona-index">TYPE / 12</text></view><image v-if="data.persona.imageUrl" class="persona-portrait" :src="data.persona.imageUrl" mode="aspectFit" /><text class="persona-name">{{ data.persona.name }}</text></view>
        <view class="persona-story"><text class="persona-verdict">“{{ data.persona.verdict }}”</text><view class="persona-stats"><text>{{ data.completedOrderCount }} 顿</text><text>省 ¥{{ (data.savedMoneyCents / 100).toFixed(2) }}</text><text>{{ data.savedCaloriesKcal }} 千卡</text></view><text class="persona-description">{{ data.persona.description }}</text></view>
        <view class="persona-footer"><view class="identity"><image v-if="data.identity?.avatarUrl" :src="data.identity.avatarUrl" /><text>{{ data.identity?.nickname || '匿名白吃选手' }}</text></view><view class="persona-qr"><text>扫码测同款</text><image v-if="data.miniProgramCodeUrl" :src="data.miniProgramCodeUrl" /></view></view>
      </view>
      <view v-else-if="data.easterEgg && eggCard" class="egg-card" :class="eggCard.skin" :style="{ '--card-accent': poster.accent }">
        <view class="card-title-zone"><text class="archive-number">AIR FOOD COLLECTION · #{{ data.easterEgg.collectionNumber }}</text></view>
        <view class="card-artwork"><view class="artwork-grid"></view><image v-if="easterEggImageUrl" class="artwork-image" :src="easterEggImageUrl" mode="aspectFit" /><text v-else class="artwork-fallback">ARCHIVE ARTWORK</text><view class="artwork-corner">COLLECTED</view></view>
        <view class="attribute-panel"><text class="panel-label">EVENT DATA</text><view class="attribute-grid"><view class="attribute"><text>虚拟消费</text><strong>¥{{ (data.savedMoneyCents / 100).toFixed(2) }}</strong></view><view class="attribute"><text>逃避热量</text><strong>{{ data.savedCaloriesKcal }} kcal</strong></view></view></view>
        <view class="story-archive"><text class="panel-label">EVENT ARCHIVE</text><text class="archive-intro">{{ eggCard.archiveText }}</text><view class="archive-quote"><text>“{{ poster.detail }}”</text></view></view>
      </view>
      <view v-else class="poster" :style="{ background: poster.background }">
        <view class="brand">这 顿 白 吃 · BAICHILE</view>
        <view class="hero" :style="{ borderColor: poster.accent }"><text class="eyebrow">{{ poster.eyebrow }}</text><text class="title">{{ poster.title }}</text></view>
        <view class="receipt"><image v-if="easterEggImageUrl" class="egg-illustration" :src="easterEggImageUrl" mode="aspectFit" /><image v-if="data.persona?.imageUrl" class="persona-character" :src="data.persona.imageUrl" mode="aspectFit" /><text v-if="data.persona" class="persona-code">{{ data.persona.acronym }}</text><text class="primary">{{ poster.primary }}</text><text class="secondary" :style="{ color: poster.accent }">{{ poster.secondary }}</text><text class="detail">{{ poster.detail }}</text>
          <view v-if="data.orderLines?.length" class="lines"><text v-for="line in data.orderLines" :key="line.menuItemId">{{ line.name }} × {{ line.quantity }}</text></view>
          <text class="stamp" :style="{ color: poster.accent, borderColor: poster.accent }">{{ poster.stamp }}</text>
        </view>
        <view class="identity"><image v-if="data.identity?.avatarUrl" :src="data.identity.avatarUrl" /><text>{{ data.identity?.nickname || '匿名白吃选手' }}</text></view>
        <view class="qr"><image v-if="data.miniProgramCodeUrl" :src="data.miniProgramCodeUrl" /><text>{{ data.miniProgramCodeUrl ? '扫码来白吃' : '右上角进入小程序' }}</text></view>
      </view>
      <view v-if="sharing && data.active" class="actions"><text v-if="rewardCents" class="reward">分享成功可得 ¥{{ (rewardCents / 100).toFixed(0) }} 虚拟饭钱</text><view class="action-buttons"><button class="primary-btn" :loading="saving" @tap="savePoster">保存海报到相册</button><button class="timeline-btn" open-type="share">发给朋友</button></view><text class="tip">发朋友圈：点击右上角 ··· → 分享到朋友圈</text></view>
      <view v-else class="claim"><text>{{ data.benefitText || '朋友请你来白吃一顿' }}</text><button class="primary-btn" @tap="start">{{ data.active ? `领 ¥${(data.inviteeRewardCents / 100).toFixed(0)} 虚拟饭钱` : '进入这顿白吃' }}</button></view>
    </template>
    <view v-else class="state">这张彩蛋卡找不到了。</view>
    <canvas canvas-id="sharePoster" class="canvas" />
  </view>
</template>

<style scoped>
.page{min-height:100vh;padding:24rpx 24rpx calc(36rpx + env(safe-area-inset-bottom));box-sizing:border-box;background:#d8d1c2;color:#191713;font-family:'PingFang SC'}.state{padding:120rpx 20rpx;text-align:center;color:#62594e}.expired{margin-bottom:18rpx;padding:18rpx;background:#191713;color:#fff;text-align:center}.egg-card{position:relative;overflow:hidden;border:3rpx solid var(--card-accent);background:#fff8de;box-shadow:12rpx 14rpx 0 #191713}.egg-card--common{--frame:#847965;background-image:repeating-linear-gradient(-45deg,rgba(25,23,19,.025) 0,rgba(25,23,19,.025) 2rpx,transparent 2rpx,transparent 12rpx)}.egg-card--rare{--frame:#d6a94d;background-image:radial-gradient(circle at 80% 13%,rgba(214,169,77,.24),transparent 27%),repeating-linear-gradient(-45deg,rgba(214,169,77,.08) 0,rgba(214,169,77,.08) 2rpx,transparent 2rpx,transparent 13rpx);box-shadow:12rpx 14rpx 0 #191713,0 0 34rpx rgba(214,169,77,.45)}.egg-card--legendary{--frame:#f1c85a;background-image:radial-gradient(circle at 82% 12%,rgba(241,200,90,.48),transparent 29%),radial-gradient(circle at 10% 80%,rgba(240,75,50,.18),transparent 28%),repeating-linear-gradient(90deg,rgba(241,200,90,.09) 0,rgba(241,200,90,.09) 2rpx,transparent 2rpx,transparent 14rpx);box-shadow:12rpx 14rpx 0 #191713,0 0 48rpx rgba(241,200,90,.66)}.egg-card--epic{--frame:#d6a94d;background-image:radial-gradient(circle at 82% 12%,rgba(214,169,77,.38),transparent 29%);box-shadow:12rpx 14rpx 0 #191713,0 0 42rpx rgba(214,169,77,.56)}.card-header{display:flex;justify-content:space-between;align-items:flex-start;padding:30rpx;border-bottom:2rpx solid #191713;background:#191713;color:#fff8de}.collection-name,.collection-subtitle,.collection-number,.rarity-tag,.event-title,.event-subtitle,.panel-label,.attribute text,.attribute strong,.archive-intro,.archive-quote,.archive-result text,.archive-result strong,.footer-label,.footer-value{display:block}.collection-name{color:#d6a94d;font-family:'DIN Alternate','PingFang SC';font-size:28rpx;font-weight:950;letter-spacing:3rpx}.collection-subtitle{margin-top:8rpx;font-size:16rpx;letter-spacing:2rpx}.collection-number{padding:10rpx 14rpx;border:2rpx solid #d6a94d;color:#d6a94d;font-family:'DIN Alternate','PingFang SC';font-size:27rpx;font-weight:950}.card-title-zone{position:relative;padding:30rpx 32rpx 24rpx;border-left:14rpx solid var(--card-accent)}.rarity-tag{color:var(--card-accent);font-family:'DIN Alternate','PingFang SC';font-size:20rpx;font-weight:950;letter-spacing:2rpx}.event-title{margin-top:14rpx;font-size:50rpx;font-weight:950;line-height:1.16}.event-subtitle{margin-top:12rpx;color:#62594e;font-size:24rpx;font-weight:800}.card-artwork{position:relative;display:flex;align-items:center;justify-content:center;height:500rpx;margin:0 26rpx;border:5rpx solid var(--frame);background:#191713;box-shadow:inset 0 0 0 12rpx rgba(255,248,222,.13)}.artwork-grid{position:absolute;inset:18rpx;border:2rpx solid rgba(255,248,222,.28);background-image:linear-gradient(90deg,rgba(255,248,222,.08) 1rpx,transparent 1rpx),linear-gradient(rgba(255,248,222,.08) 1rpx,transparent 1rpx);background-size:28rpx 28rpx}.artwork-image{position:relative;z-index:1;width:100%;height:100%;filter:drop-shadow(0 16rpx 14rpx rgba(0,0,0,.38))}.artwork-fallback{position:relative;z-index:1;color:#fff8de;font-family:'DIN Alternate','PingFang SC';font-size:29rpx;font-weight:950;letter-spacing:4rpx}.artwork-corner{position:absolute;z-index:2;right:18rpx;bottom:18rpx;padding:8rpx 12rpx;border:2rpx solid #fff8de;color:#fff8de;font-family:'DIN Alternate','PingFang SC';font-size:17rpx;font-weight:900;letter-spacing:2rpx;transform:rotate(-4deg)}.attribute-panel,.story-archive{margin:30rpx 26rpx 0;padding:26rpx;border:2rpx solid #191713;background:rgba(255,255,255,.52)}.panel-label{color:var(--card-accent);font-family:'DIN Alternate','PingFang SC';font-size:20rpx;font-weight:950;letter-spacing:3rpx}.attribute-grid{display:grid;grid-template-columns:1fr 1fr;margin-top:22rpx;border-top:2rpx solid #191713;border-left:2rpx solid #191713}.attribute{min-height:104rpx;padding:17rpx;border-right:2rpx solid #191713;border-bottom:2rpx solid #191713}.attribute text{color:#62594e;font-size:19rpx;font-weight:800}.attribute strong{margin-top:10rpx;color:#191713;font-family:'DIN Alternate','PingFang SC';font-size:29rpx;font-weight:950;letter-spacing:1rpx}.story-archive{margin-top:22rpx}.archive-intro{margin-top:18rpx;font-size:26rpx;font-weight:800;line-height:1.58}.archive-quote{margin-top:20rpx;padding:18rpx;border-left:7rpx solid var(--card-accent);background:#191713;color:#fff8de;font-size:24rpx;font-weight:800;line-height:1.55}.archive-result{display:flex;justify-content:space-between;gap:20rpx;margin-top:22rpx;padding-top:18rpx;border-top:2rpx dashed #8d826f}.archive-result text{color:#62594e;font-size:20rpx;font-weight:800}.archive-result strong{color:var(--card-accent);font-size:23rpx;font-weight:950;text-align:right}.card-footer{display:flex;justify-content:space-between;align-items:center;min-height:126rpx;margin-top:30rpx;padding:22rpx 30rpx;border-top:3rpx solid var(--frame);background:#191713;color:#fff8de}.footer-label{color:#d6a94d;font-family:'DIN Alternate','PingFang SC';font-size:17rpx;font-weight:900;letter-spacing:2rpx}.footer-value{margin-top:8rpx;font-size:21rpx;font-weight:800}.footer-right{display:flex;align-items:center}.egg-qr{display:flex;align-items:center;gap:12rpx;font-size:18rpx;font-weight:800}.egg-qr image{width:76rpx;height:76rpx;background:#fff}.egg-enter-tip{color:#d6a94d;font-size:19rpx;font-weight:900}.actions,.claim{display:flex;flex-direction:column;gap:18rpx;margin-top:28rpx;padding:28rpx;background:#fff;border:2rpx solid #191713}.action-buttons{display:flex;gap:16rpx}.reward,.tip,.claim>text{text-align:center;font-size:24rpx}.reward{color:#b33a29;font-weight:900}.tip{color:#746b61}.primary-btn,.timeline-btn{margin:0;border-radius:14rpx;font-weight:900}.action-buttons .primary-btn,.action-buttons .timeline-btn{flex:1;font-size:25rpx}.primary-btn{background:#ffd400;color:#191713}.timeline-btn{border:2rpx solid #191713;background:#fff}.persona-poster{overflow:hidden;border:3rpx solid #191713;background:#f4eedf;box-shadow:10rpx 10rpx 0 rgba(25,23,19,.16)}.persona-brand{display:flex;flex-direction:column;gap:8rpx;margin:28rpx;padding:24rpx 28rpx;background:#191713;color:#ffd400;font-size:26rpx;font-weight:900;letter-spacing:2rpx}.persona-brand small{color:#fff8de;font-size:17rpx;font-weight:600;letter-spacing:3rpx}.persona-hero{position:relative;height:540rpx;margin:0 28rpx;background:#ffd400}.persona-meta{position:absolute;z-index:2;top:28rpx;left:30rpx;right:30rpx;display:flex;justify-content:space-between;align-items:flex-start}.persona-acronym{font-size:76rpx;font-weight:950;line-height:1}.persona-index{padding-top:10rpx;font-size:20rpx;font-weight:900}.persona-portrait{position:absolute;left:50%;bottom:42rpx;width:390rpx;height:390rpx;transform:translateX(-50%)}.persona-name{position:absolute;left:30rpx;bottom:22rpx;font-size:39rpx;font-weight:950}.persona-story{margin:0 28rpx;padding:34rpx 30rpx;background:#fff}.persona-verdict,.persona-description{display:block}.persona-verdict{min-height:92rpx;font-size:31rpx;font-weight:900;line-height:1.45}.persona-stats{display:flex;justify-content:space-between;margin:26rpx 0;padding:20rpx 18rpx;background:#2e8b72;color:#fff;font-size:21rpx;font-weight:800}.persona-description{color:#62594e;font-size:24rpx;line-height:1.65}.persona-footer{display:flex;align-items:center;justify-content:space-between;margin:0 28rpx 28rpx;padding:22rpx 26rpx;border-top:2rpx solid #191713;background:#fff8de}.identity{display:flex;align-items:center;gap:14rpx;font-size:24rpx;font-weight:800}.identity image{width:58rpx;height:58rpx;border-radius:50%;background:#191713}.persona-qr{display:flex;align-items:center;gap:14rpx;font-size:20rpx;font-weight:800}.persona-qr image{width:96rpx;height:96rpx}.poster{min-height:760rpx;padding:34rpx;border:3rpx solid #191713;box-sizing:border-box;overflow:hidden}.brand{padding:24rpx;background:#191713;color:#ffd400;font-size:24rpx;font-weight:900;letter-spacing:4rpx}.hero{margin-top:42rpx;padding-left:28rpx;border-left:14rpx solid}.eyebrow,.title,.primary,.secondary,.detail{display:block}.eyebrow{font-size:24rpx;font-weight:800}.title{margin-top:20rpx;font-size:52rpx;font-weight:950;line-height:1.18}.receipt{margin-top:42rpx;padding:42rpx 34rpx;background:#fff}.primary{font-size:34rpx;font-weight:950;line-height:1.45}.secondary{margin-top:24rpx;font-size:28rpx;font-weight:900}.detail{margin-top:30rpx;color:#62594e;font-size:26rpx;line-height:1.55}.canvas{position:fixed;left:-9999px;top:0;width:750px;height:1334px}
.poster{position:relative;min-height:1050rpx}.eyebrow,.title,.primary,.secondary,.detail,.lines text{display:block}.receipt{position:relative;padding:42rpx 34rpx 110rpx}.persona-character,.egg-illustration{position:absolute;right:12rpx;top:8rpx;width:250rpx;height:250rpx}.persona-code{display:block;margin-bottom:16rpx;color:#2e8b72;font-size:50rpx;font-weight:950;letter-spacing:6rpx}.primary{position:relative;max-width:420rpx}.detail{max-width:410rpx}.lines{margin-top:28rpx;padding-top:20rpx;border-top:2rpx dashed #bdb4a5;color:#494239;font-size:23rpx;line-height:1.7}.stamp{position:absolute;right:26rpx;bottom:24rpx;padding:12rpx 18rpx;border:4rpx solid;font-size:22rpx;font-weight:900;transform:rotate(-5deg)}.identity{display:flex;align-items:center;gap:14rpx;margin-top:32rpx;font-size:24rpx;font-weight:800}.identity image{width:58rpx;height:58rpx;border-radius:50%;background:#191713}.qr{position:absolute;right:42rpx;bottom:30rpx;display:flex;flex-direction:column;align-items:center;font-size:20rpx}.qr image{width:150rpx;height:150rpx}.archive-number{display:block;color:#62594e;font-family:'DIN Alternate','PingFang SC';font-size:19rpx;font-weight:900;letter-spacing:2rpx}.card-title-zone{padding-top:24rpx;padding-bottom:20rpx}.card-artwork{height:650rpx;overflow:hidden}.artwork-image{width:116%;height:116%}
</style>
