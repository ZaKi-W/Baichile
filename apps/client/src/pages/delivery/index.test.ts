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
    expect(source).toContain('goToStore');
  });
});
