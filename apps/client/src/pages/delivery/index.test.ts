import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('delivery page status initialization', () => {
  it('restores the current order step before waiting for store details', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');
    const onLoadBody = source.slice(source.indexOf('onLoad(async'));

    expect(onLoadBody.indexOf('startStepTimer();')).toBeLessThan(
      onLoadBody.indexOf('await resolveStoreInfo();'),
    );
  });

  it('uses one full-width aligned node timeline', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).not.toContain('class="progress-track"');
    expect(source).not.toContain('<scroll-view scroll-x class="timeline-scroll">');
    expect(source).toContain('class="step-node"');
    expect(source).toContain('.step {');
    expect(source).toContain('flex: 1;');
  });

  it('shows incident outcomes, refund state, and a reorder action', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('配送失败');
    expect(source).toContain('已退款');
    expect(source).toContain('重新点一单');
    expect(source).toContain('再来一单');
    expect(source).toContain('reorderCurrent');
  });

  it('keeps reorder and share actions in one horizontal action row', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('class="order-primary-actions"');
    expect(source).toContain('class="order-primary-button reorder-button"');
    expect(source).toContain('class="order-primary-button share-button"');
    expect(source).toContain('v-if="canShareOrder"');
    expect(source).toContain('if (hasFailed.value) return true;');
    expect(source).toContain('if (hasIncident.value) return false;');
    expect(source).toContain('.order-primary-actions {');
    expect(source).toContain('display: flex;');
    expect(source).not.toContain('.share-button { margin-top:');
  });

  it('reveals and persists unified order easter eggs', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('createOrderEggPresentation');
    expect(source).toContain('hasSeenOrderEgg');
    expect(source).toContain('markOrderEggSeen');
    expect(source).toContain('class="egg-card"');
    expect(source).toContain('class="egg-reveal-backdrop"');
    expect(source).toContain('class="egg-reveal-image"');
    expect(source).toContain(':src="eggPresentation.imageUrl"');
    expect(source).toContain('eggRevealImageReady');
    expect(source).toContain('@load="handleEggRevealImageLoad"');
    expect(source).toContain('egg-reveal-artwork-in');
    expect(source).toContain('egg-reveal-dialog-in');
    expect(source).toContain('handleEggRevealImageError');
    expect(source).toContain('menuButtonRect.bottom + 16');
    expect(source).toContain(':style="eggRevealBackdropStyle"');
    expect(source).toContain('max-height: 100%;');
    expect(source).not.toContain('height: calc(100vh - 108rpx);');
    expect(source).not.toContain('<scroll-view class="egg-reveal-scroll"');
    expect(source).not.toContain('class="egg-card-image"');
    expect(source).not.toContain('handleEggCardImageError');
    expect(source).toContain("options?.revealEgg === '1'");
    expect(source).toContain('forceEggRevealRequested.value = false');
    expect(source).toContain('{ force: forceEggRevealRequested.value }');
    expect(source).toContain('收下彩蛋');
    expect(source).toContain('分享这枚彩蛋');
    expect(source).toContain('prepareOrderShare');
    expect(source).toContain('prepareEggShare');
    expect(source).toContain("kind: 'order_egg'");
    expect(source).toContain('const canShareEgg');
    expect(source).toContain('分享准备失败');
    expect(source).toContain("orders.fetchDetail(currentOrder.id, { force: true })");
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('shows order detail, payment, order number, and delivery information', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('订单详情');
    expect(source).toContain('dish-thumb');
    expect(source).toContain('store-thumb');
    expect(source).toContain('storeCoverUrl.value = detail.coverUrl');
    expect(source).toContain(':src="storeCoverUrl"');
    expect(source).not.toContain("order.value?.lines.find((line) => line.imageUrl)?.imageUrl");
    expect(source).toContain('实付');
    expect(source).toContain('收货地址');
    expect(source).toContain('配送时间');
    expect(source).toContain('下单时间');
    expect(source).toContain('支付方式');
    expect(source).toContain('订单号');
    expect(source).toContain('复制');
    expect(source).toContain('paymentMethodText');
  });
});
