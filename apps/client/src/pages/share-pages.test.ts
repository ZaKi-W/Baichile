import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const order = readFileSync(new URL('./share-order/index.vue', import.meta.url), 'utf8');
const egg = readFileSync(new URL('./share-egg/index.vue', import.meta.url), 'utf8');
const achievement = readFileSync(new URL('./share-achievement/index.vue', import.meta.url), 'utf8');
const reward = readFileSync(new URL('./share-reward/index.vue', import.meta.url), 'utf8');
const landing = readFileSync(new URL('./share-landing/index.vue', import.meta.url), 'utf8');
const shared = readFileSync(new URL('../styles/share-gacha.scss', import.meta.url), 'utf8');

describe('gacha share pages', () => {
  const sources = [order, egg, achievement, reward, landing];

  it('uses one gacha design system without the editorial narrative', () => {
    for (const source of sources) {
      expect(source).toContain('share-gacha');
      expect(source).toContain("@use '../../styles/share-gacha.scss' as *;");
      expect(source).not.toContain('share-editorial');
      expect(source).not.toContain('食堂编辑部');
    }
    expect(shared).toContain('--gacha-yellow: #ffd400');
    expect(shared).toContain('--gacha-mint: #36bfa1');
    expect(shared).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('gives every content type a distinct subject and full poster action', () => {
    expect(order).toContain('class="order-report"');
    expect(order).toContain('这顿吃了什么');
    expect(order).toContain('catalogService.search(storeName)');
    expect(order).toContain('order-store-mark--image');
    expect(order).toContain("kind: 'order'");
    expect(egg).toContain('配送奇遇扭蛋');
    expect(egg).toContain('class="egg-poster"');
    expect(egg).toContain('今日发现');
    expect(egg).toContain("kind: 'order_egg'");
    expect(achievement).toContain('白吃等级已刷新');
    expect(achievement).toContain("kind: 'achievement'");
    expect(reward).toContain('好友饭钱胶囊');
    expect(reward).toContain("kind: 'reward'");
    expect(landing).toContain('你的白吃人格');
    expect(landing).toContain("kind: 'persona'");
    for (const source of sources) expect(source).toContain('saveGachaPoster');
  });

  it('keeps legacy routing and provides a dedicated cover for all five share types', () => {
    expect(landing).toContain('legacyShareTarget');
    expect(landing).toContain("...(rewardCents.value ? [`reward=${rewardCents.value}`] : [])");
    for (const kind of ['order', 'order_egg', 'persona', 'achievement', 'reward']) {
      expect(existsSync(new URL(`../static/share/gacha-${kind}-cover.png`, import.meta.url))).toBe(true);
    }
  });

  it('keeps the egg action bar in document flow so it cannot cover a long title', () => {
    expect(egg).toContain('position:sticky');
    expect(egg).toContain('.egg-copy-button{padding:0;white-space:nowrap}');
  });

  it('uses a complete order report layout with readable metrics and protected action space', () => {
    expect(order).toContain('.order-hero {');
    expect(order).toContain('min-height: 312rpx;');
    expect(order).toContain('.order-section {');
    expect(order).toContain('.order-store-avatar');
    expect(order).not.toContain('本次白吃扭蛋 · 订单已完成');
    expect(order).toContain('.order-metric--mint { background: #c9f4dc; }');
    expect(order).toContain('.order-metric--yellow { background: #fff09b; }');
    expect(order).toContain('padding: 24rpx 24rpx calc(230rpx + env(safe-area-inset-bottom));');
    expect(order).toContain('position: fixed');
    expect(order).not.toContain('<small>');
    expect(order).not.toContain('<strong>');
  });
});
