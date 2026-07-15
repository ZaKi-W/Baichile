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

  it('gives every content type a distinct capsule subject and full poster action', () => {
    expect(order).toContain('本次白吃扭蛋');
    expect(order).toContain("kind: 'order'");
    expect(egg).toContain('配送奇遇扭蛋');
    expect(egg).toContain("kind: 'order_egg'");
    expect(achievement).toContain('白吃等级已刷新');
    expect(achievement).toContain("kind: 'achievement'");
    expect(reward).toContain('好友饭钱胶囊');
    expect(reward).toContain("kind: 'reward'");
    expect(landing).toContain('你的白吃人格');
    expect(landing).toContain("kind: 'persona'");
    for (const source of sources) expect(source).toContain('保存海报');
  });

  it('keeps legacy routing and provides a dedicated cover for all five share types', () => {
    expect(landing).toContain('legacyShareTarget');
    expect(landing).toContain("...(rewardCents.value ? [`reward=${rewardCents.value}`] : [])");
    for (const kind of ['order', 'order_egg', 'persona', 'achievement', 'reward']) {
      expect(existsSync(new URL(`../static/share/gacha-${kind}-cover.png`, import.meta.url))).toBe(true);
    }
  });
});
