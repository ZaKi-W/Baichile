<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import { useSharePage } from '../../features/share-page';
import { saveGachaPoster, shareCoverPath } from '../../utils/share-poster-canvas';

const page = useSharePage();
const saving = ref(false);
const title = computed(() => page.data.value?.title || '我刚刚撤回了这顿外卖');
const money = computed(() => (page.data.value?.savedMoneyCents || 0) / 100);
const leadLine = computed(() => page.data.value?.orderLines?.[0]);
const dishCount = computed(() => page.data.value?.orderLines?.length || 0);
const ownerName = computed(() => page.data.value?.identity?.nickname || '匿名白吃选手');

onLoad((options) => { void page.load(options); });
onShareTimeline(() => ({ title: title.value, query: page.shareQuery(), imageUrl: shareCoverPath('order') }));
onShareAppMessage(() => ({ title: title.value, path: `/pages/share-order/index?${page.shareQuery()}`, imageUrl: shareCoverPath('order') }));

async function savePoster() {
  const data = page.data.value;
  if (!data || saving.value) return;
  saving.value = true;
  try {
    await saveGachaPoster({ canvasId: 'orderPoster', data, kind: 'order', subjectImageUrl: leadLine.value?.imageUrl });
    uni.showToast({ title: '海报已保存', icon: 'success' });
  } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '海报保存失败', icon: 'none' }); }
  finally { saving.value = false; }
}
</script>

<template>
  <view class="share-gacha order-gacha">
    <view v-if="page.loading.value" class="gacha-state"><text>正在摇出这单白吃结果</text><view class="gacha-loading-track" /></view>
    <template v-else-if="page.data.value">
      <view v-if="page.data.value.expired" class="gacha-expired">这份白吃结果已过期，但仍可围观。</view>
      <view class="gacha-brand-row"><text class="gacha-brand">白吃扭蛋站</text><text class="gacha-ticket">ORDER CAPSULE</text></view>
      <view class="gacha-orbit" />

      <view class="order-intro"><view><view class="gacha-section-kicker">本次白吃扭蛋</view><text>{{ page.data.value.storeName || '神秘小馆' }}</text></view><view class="order-count"><small>本单菜品</small><strong>{{ String(dishCount).padStart(2, '0') }}</strong></view></view>
      <view class="order-machine gacha-capsule">
        <view class="order-copy"><text>下单了，<br />但没吃。</text><small>这枚订单胶囊已成功撤回</small></view>
        <view class="gacha-machine-window order-photo"><image v-if="leadLine?.imageUrl" :src="leadLine.imageUrl" mode="aspectFill" aria-label="本单主菜图片" /><view v-else class="order-photo-fallback"><text>{{ leadLine?.name.slice(0, 1) || '白' }}</text></view><text>{{ leadLine?.name || '本单主菜' }}</text></view>
      </view>
      <view class="order-metrics"><view><text>本单实付</text><strong>¥{{ money.toFixed(2) }}</strong><small>含配送费与打包费</small></view><view><text>躲过热量</text><strong>{{ page.data.value.savedCaloriesKcal }}</strong><small>kcal</small></view></view>

      <view class="order-list-title"><view class="gacha-section-kicker">扭蛋内容</view><text>{{ dishCount }} 项</text></view>
      <view v-if="page.data.value.orderLines?.length" class="order-lines"><view v-for="(line, index) in page.data.value.orderLines" :key="line.menuItemId + line.optionNames.join(',')" class="order-line"><text class="line-index">{{ String(index + 1).padStart(2, '0') }}</text><image v-if="line.imageUrl" :src="line.imageUrl" mode="aspectFill" aria-label="菜品图片" /><view v-else class="line-fallback"><text>{{ line.name.slice(0, 1) }}</text></view><view class="line-copy"><text>{{ line.name }}</text><small>{{ line.optionNames.join('、') || '默认规格' }} · ×{{ line.quantity }}</small></view><text class="line-price">¥{{ (line.totalCents / 100).toFixed(2) }}</text></view></view>

      <view class="order-footer"><view class="gacha-identity"><image v-if="page.data.value.identity?.avatarUrl" :src="page.data.value.identity.avatarUrl" aria-label="分享者头像" /><view v-else class="gacha-avatar-fallback"><text>{{ ownerName.slice(0, 1) }}</text></view><text>{{ ownerName }} 的白吃结果</text></view><view v-if="page.data.value.miniProgramCodeUrl" class="gacha-qr"><text>扫码开同款</text><image :src="page.data.value.miniProgramCodeUrl" aria-label="小程序码" /></view></view>
    </template>
    <view v-else class="gacha-empty">这张白吃结果找不到了。</view>
    <view v-if="page.sharing.value && page.data.value?.active" class="gacha-action-bar"><button class="gacha-secondary" :loading="saving" @tap="savePoster">保存海报</button><button class="gacha-primary" open-type="share">发给朋友</button></view>
    <view v-else-if="page.data.value" class="gacha-visitor"><text>这一顿没吃，也算抽到了一次胜利。</text><button class="gacha-primary" @tap="page.enterApp">进入这顿白吃</button></view>
    <canvas canvas-id="orderPoster" class="gacha-canvas" />
  </view>
</template>

<style scoped lang="scss">
@use '../../styles/share-gacha.scss' as *;
.order-intro{display:flex;align-items:flex-end;justify-content:space-between;gap:24rpx;margin:4rpx 0 24rpx}.order-intro>view:first-child>text{display:block;max-width:510rpx;margin-top:14rpx;font-size:56rpx;font-weight:950;line-height:1.1}.order-count{display:flex;flex-direction:column;align-items:flex-end;flex:0 0 auto;padding-bottom:8rpx}.order-count small{font-size:18rpx;font-weight:800}.order-count strong{margin-top:6rpx;color:var(--gacha-orange);font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:54rpx;font-weight:900;line-height:.8}.order-machine{display:grid;grid-template-columns:.92fr 1.08fr;min-height:406rpx}.order-copy{display:flex;flex-direction:column;justify-content:space-between;padding:34rpx 20rpx 34rpx 30rpx}.order-copy text{font-size:45rpx;font-weight:950;line-height:1.16}.order-copy small{max-width:205rpx;color:var(--gacha-muted);font-size:20rpx;font-weight:750;line-height:1.45}.order-photo{min-width:0;margin:24rpx 24rpx 24rpx 0}.order-photo image,.order-photo-fallback{width:100%;height:100%}.order-photo-fallback{display:flex;align-items:center;justify-content:center;color:var(--gacha-paper);background:var(--gacha-mint);font-size:100rpx;font-weight:900}.order-photo>text{position:absolute;right:16rpx;bottom:16rpx;left:16rpx;z-index:2;overflow:hidden;padding:12rpx;border-radius:14rpx;background:rgba(25,23,19,.86);color:#fff;font-size:19rpx;font-weight:800;text-overflow:ellipsis;white-space:nowrap}.order-metrics{display:grid;grid-template-columns:1.13fr .87fr;gap:14rpx;margin-top:30rpx}.order-metrics view{min-height:172rpx;padding:26rpx;border:4rpx solid var(--gacha-ink);border-radius:30rpx 12rpx 30rpx 12rpx;background:#fff}.order-metrics view:last-child{background:var(--gacha-mint)}.order-metrics text,.order-metrics strong,.order-metrics small{display:block}.order-metrics text{font-size:20rpx;font-weight:800}.order-metrics strong{margin-top:18rpx;font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:41rpx;font-weight:900;line-height:1}.order-metrics small{margin-top:12rpx;color:var(--gacha-muted);font-size:18rpx}.order-metrics view:last-child small{color:rgba(25,23,19,.72)}.order-list-title{display:flex;align-items:center;justify-content:space-between;margin-top:46rpx;padding-bottom:18rpx;border-bottom:3rpx solid var(--gacha-ink)}.order-list-title>text{font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:22rpx;font-weight:900}.order-line{display:grid;grid-template-columns:42rpx 82rpx minmax(0,1fr) auto;align-items:center;gap:16rpx;min-height:122rpx;border-bottom:2rpx solid var(--gacha-line)}.line-index{color:var(--gacha-orange);font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:19rpx;font-weight:900}.order-line image,.line-fallback{width:82rpx;height:82rpx;border:3rpx solid var(--gacha-ink);border-radius:18rpx 8rpx 18rpx 8rpx;background:var(--gacha-yellow)}.line-fallback{display:flex;align-items:center;justify-content:center;font-size:34rpx;font-weight:900}.line-copy{min-width:0}.line-copy text,.line-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.line-copy text{font-size:25rpx;font-weight:850}.line-copy small{margin-top:8rpx;color:var(--gacha-muted);font-size:18rpx}.line-price{font-family:'DIN Alternate','PingFang SC',sans-serif;font-size:23rpx;font-weight:900;white-space:nowrap}.order-footer{display:flex;align-items:flex-end;justify-content:space-between;gap:18rpx;margin-top:30rpx;padding-top:22rpx;border-top:3rpx solid var(--gacha-ink)}@media(max-width:350px){.order-intro>view:first-child>text{font-size:50rpx}.order-machine{min-height:370rpx}.order-copy text{font-size:39rpx}.order-line{grid-template-columns:36rpx 72rpx minmax(0,1fr) auto;gap:12rpx}.order-line image,.line-fallback{width:72rpx;height:72rpx}.gacha-qr text{display:none}}
.order-intro{margin:28rpx 0 20rpx}.order-intro>view:first-child>text{font-size:46rpx}.order-count strong{color:var(--gacha-ink);font-size:44rpx}.order-machine{min-height:318rpx}.order-copy{padding:28rpx}.order-copy text{font-size:37rpx}.order-copy small{max-width:190rpx}.order-photo{margin:16rpx 16rpx 16rpx 0}.order-photo>text{right:10rpx;bottom:10rpx;left:10rpx;border-radius:8rpx;font-size:18rpx}.order-metrics{gap:0;margin-top:28rpx;border-top:1rpx solid var(--gacha-line);border-bottom:1rpx solid var(--gacha-line)}.order-metrics view,.order-metrics view:last-child{min-height:132rpx;padding:22rpx 0;border:0;border-radius:0;background:transparent}.order-metrics view+view{padding-left:26rpx;border-left:1rpx solid var(--gacha-line)}.order-metrics strong{margin-top:13rpx;font-size:34rpx}.order-list-title{margin-top:30rpx;border-bottom:1rpx solid var(--gacha-line)}.order-line{min-height:108rpx;border-bottom:1rpx solid var(--gacha-line)}.order-line image,.line-fallback{border:0;border-radius:8rpx}.order-footer{border-top:1rpx solid var(--gacha-line)}
</style>
