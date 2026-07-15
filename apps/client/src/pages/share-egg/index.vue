<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import { useSharePage } from '../../features/share-page';
import { orderEggImageUrl } from '../../utils/order-easter-egg';
import { saveGachaPoster, shareCoverPath } from '../../utils/share-poster-canvas';

const page = useSharePage();
const saving = ref(false);
const egg = computed(() => page.data.value?.easterEgg);
const incident = computed(() => egg.value?.id.startsWith('incident-') || false);
const eggId = computed(() => incident.value ? egg.value?.id.slice('incident-'.length) || '' : egg.value?.id || '');
const imageUrl = computed(() => egg.value ? orderEggImageUrl(incident.value ? 'incident' : 'collection', eggId.value) : '');
const title = computed(() => page.data.value?.title || `我抽到了彩蛋：${egg.value?.name || '神秘胶囊'}`);
const rarityLabel = computed(() => egg.value?.rarity === 'legendary' ? '传说胶囊' : egg.value?.rarity === 'rare' ? '稀有胶囊' : '惊喜胶囊');
const ownerName = computed(() => page.data.value?.identity?.nickname || '匿名白吃选手');
const accent = computed(() => egg.value?.themeColor || '#FF7145');
const capsuleType = computed(() => incident.value ? '配送奇遇扭蛋' : '订单隐藏扭蛋');
const capsuleNote = computed(() => incident.value ? '这次配送绕了个弯，才把惊喜摇到了你手里。' : '这枚扭蛋藏在空气外卖里，已经被你成功抽中。');
const shareCopy = computed(() => `我在「这顿白吃」抽到了${rarityLabel.value}：${egg.value?.name || '神秘胶囊'}\n${egg.value?.verdict || '每一顿没吃上的饭，都可能摇出一点惊喜。'}`);

onLoad((options) => { void page.load(options); });
onShareTimeline(() => ({ title: title.value, query: page.shareQuery(), imageUrl: shareCoverPath('order_egg') }));
onShareAppMessage(() => ({ title: title.value, path: `/pages/share-egg/index?${page.shareQuery()}`, imageUrl: shareCoverPath('order_egg') }));

function copyShareText() { uni.setClipboardData({ data: shareCopy.value, success: () => uni.showToast({ title: '已复制分享文案', icon: 'success' }) }); }
async function savePoster() {
  const data = page.data.value;
  if (!data || saving.value) return;
  saving.value = true;
  try { await saveGachaPoster({ canvasId: 'eggPoster', data, kind: 'order_egg', subjectImageUrl: imageUrl.value }); uni.showToast({ title: '海报已保存', icon: 'success' }); }
  catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '海报保存失败', icon: 'none' }); }
  finally { saving.value = false; }
}
</script>

<template>
  <view class="share-gacha egg-gacha" :style="{ '--egg-accent': accent }">
    <view v-if="page.loading.value" class="gacha-state"><text>正在摇出今日隐藏彩蛋</text><view class="gacha-loading-track" /></view>
    <template v-else-if="page.data.value && egg">
      <view v-if="page.data.value.expired" class="gacha-expired">这枚彩蛋已过期，但仍可围观。</view>
      <view class="gacha-brand-row"><text class="gacha-brand">白吃扭蛋站</text><text class="gacha-ticket">HIDDEN CAPSULE · {{ egg.collectionNumber }}</text></view>
      <view class="gacha-orbit" />
      <view class="egg-title-row"><view><view class="gacha-section-kicker">{{ capsuleType }}</view><text>{{ egg.name }}</text></view><view class="egg-rarity"><small>本次抽中</small><strong>{{ rarityLabel }}</strong></view></view>
      <view class="egg-machine gacha-capsule"><view class="gacha-machine-window egg-art"><image :src="imageUrl" mode="aspectFill" aria-label="彩蛋插画" /><view class="egg-number"><text>NO.</text><strong>{{ egg.collectionNumber }}</strong></view></view><view class="egg-result"><text>扭蛋结果</text><strong>“{{ egg.verdict }}”</strong><small>{{ capsuleNote }}</small></view></view>
      <view class="egg-facts"><view><text>扭蛋类型</text><strong>{{ capsuleType }}</strong></view><view><text>抽中等级</text><strong>{{ rarityLabel }}</strong></view></view>
      <view class="egg-copy"><text>分享这一枚彩蛋</text><strong>让朋友也来看看，你的空气外卖里摇出了什么。</strong><button @tap="copyShareText">复制分享文案</button></view>
      <view class="egg-footer"><view class="gacha-identity"><image v-if="page.data.value.identity?.avatarUrl" :src="page.data.value.identity.avatarUrl" aria-label="发现者头像" /><view v-else class="gacha-avatar-fallback"><text>{{ ownerName.slice(0, 1) }}</text></view><text>{{ ownerName }} 抽中</text></view><view v-if="page.data.value.miniProgramCodeUrl" class="gacha-qr"><text>来抽同款</text><image :src="page.data.value.miniProgramCodeUrl" aria-label="小程序码" /></view></view>
    </template>
    <view v-else class="gacha-empty">这枚彩蛋找不到了。</view>
    <view v-if="page.sharing.value && page.data.value?.active" class="gacha-action-bar"><button class="gacha-secondary" :loading="saving" @tap="savePoster">保存海报</button><button class="gacha-primary" open-type="share">分享彩蛋</button></view>
    <view v-else-if="page.data.value" class="gacha-visitor"><text>你的订单里，也可能摇出一枚隐藏彩蛋。</text><button class="gacha-primary" @tap="page.enterApp">进入这顿白吃</button></view>
    <canvas canvas-id="eggPoster" class="gacha-canvas" />
  </view>
</template>

<style scoped lang="scss">
@use '../../styles/share-gacha.scss' as *;
.egg-gacha{--egg-accent:var(--gacha-orange)}.egg-title-row{display:flex;align-items:flex-end;justify-content:space-between;gap:18rpx;margin-bottom:26rpx}.egg-title-row>view:first-child{min-width:0}.egg-title-row>view:first-child>text{display:block;overflow:hidden;max-width:490rpx;margin-top:16rpx;font-size:54rpx;font-weight:950;line-height:1.12;text-overflow:ellipsis;white-space:nowrap}.egg-rarity{display:flex;flex:0 0 auto;flex-direction:column;gap:8rpx;align-items:flex-end;padding-bottom:6rpx}.egg-rarity small{font-size:18rpx;font-weight:800}.egg-rarity strong{padding:10rpx 14rpx;border:3rpx solid var(--gacha-ink);border-radius:18rpx 6rpx 18rpx 6rpx;background:var(--egg-accent);font-size:20rpx;font-weight:900}.egg-machine{padding:26rpx}.egg-art{height:496rpx}.egg-art image{width:100%;height:100%;filter:saturate(1.06) contrast(1.04)}.egg-number{position:absolute;right:20rpx;bottom:20rpx;z-index:2;display:flex;align-items:flex-end;gap:10rpx;padding:16rpx;border:3rpx solid var(--gacha-ink);border-radius:20rpx 8rpx 20rpx 8rpx;background:var(--gacha-yellow)}.egg-number text{font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:18rpx;font-weight:900}.egg-number strong{font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:36rpx;font-weight:900;line-height:.8}.egg-result{padding:28rpx 4rpx 4rpx}.egg-result text,.egg-result strong,.egg-result small{display:block}.egg-result text{color:var(--egg-accent);font-size:20rpx;font-weight:900}.egg-result strong{margin-top:12rpx;font-size:30rpx;font-weight:900;line-height:1.45}.egg-result small{margin-top:16rpx;color:var(--gacha-muted);font-size:22rpx;line-height:1.55}.egg-facts{display:grid;grid-template-columns:1fr 1fr;gap:14rpx;margin-top:28rpx}.egg-facts view{min-height:132rpx;padding:24rpx;border:3rpx solid var(--gacha-ink);border-radius:28rpx 10rpx 28rpx 10rpx;background:#fff}.egg-facts view:last-child{background:var(--gacha-yellow)}.egg-facts text,.egg-facts strong{display:block}.egg-facts text{font-size:19rpx;font-weight:750}.egg-facts strong{margin-top:14rpx;font-size:25rpx;font-weight:900;line-height:1.35}.egg-copy{margin-top:28rpx;padding:28rpx;border:3rpx solid var(--gacha-ink);border-radius:30rpx 12rpx 30rpx 12rpx;background:var(--gacha-mint)}.egg-copy text,.egg-copy strong{display:block}.egg-copy text{font-size:20rpx;font-weight:900}.egg-copy strong{margin-top:12rpx;font-size:25rpx;line-height:1.52}.egg-copy button{min-height:66rpx;margin-top:18rpx;padding:0;border-bottom:3rpx solid var(--gacha-ink);border-radius:0;background:transparent;color:var(--gacha-ink);font-size:21rpx;font-weight:900;line-height:66rpx}.egg-footer{display:flex;align-items:flex-end;justify-content:space-between;gap:18rpx;margin-top:28rpx;padding-top:22rpx;border-top:3rpx solid var(--gacha-ink)}@media(max-width:350px){.egg-title-row>view:first-child>text{font-size:48rpx}.egg-art{height:452rpx}.gacha-qr text{display:none}}
.egg-title-row{margin:28rpx 0 20rpx}.egg-title-row>view:first-child>text{font-size:46rpx}.egg-rarity strong{padding:0;border:0;border-radius:0;background:transparent;color:var(--egg-accent);font-size:20rpx}.egg-machine{padding:16rpx}.egg-art{height:370rpx}.egg-number{right:12rpx;bottom:12rpx;padding:10rpx;border:0;border-radius:8rpx}.egg-result{padding:24rpx 8rpx 8rpx}.egg-result strong{font-size:27rpx}.egg-facts{gap:0;margin-top:26rpx;border-top:1rpx solid var(--gacha-line);border-bottom:1rpx solid var(--gacha-line)}.egg-facts view,.egg-facts view:last-child{min-height:112rpx;padding:20rpx 0;border:0;border-radius:0;background:transparent}.egg-facts view+view{padding-left:26rpx;border-left:1rpx solid var(--gacha-line)}.egg-copy{margin-top:24rpx;padding:0;border:0;border-radius:0;background:transparent}.egg-copy strong{font-size:23rpx}.egg-copy button{border-bottom:1rpx solid var(--gacha-ink)}.egg-footer{border-top:1rpx solid var(--gacha-line)}
</style>
