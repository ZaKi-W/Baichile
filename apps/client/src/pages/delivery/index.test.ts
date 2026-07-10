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
    expect(source).toContain('goToStore');
  });

  it('shows order detail, payment, order number, and delivery information', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('订单详情');
    expect(source).toContain('dish-thumb');
    expect(source).toContain('store-thumb');
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
