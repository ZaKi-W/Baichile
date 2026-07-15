import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const home = readFileSync(new URL('./home/index.vue', import.meta.url), 'utf8');
const profile = readFileSync(new URL('./profile/index.vue', import.meta.url), 'utf8');
const reward = readFileSync(new URL('./share-reward/index.vue', import.meta.url), 'utf8');

describe('share reward entry points', () => {
  it('promotes the share reward from home and profile', () => {
    expect(home).not.toContain('分享朋友圈，领虚拟饭钱');
    expect(profile).toContain('测测我的白吃人格');
    expect(profile).toContain('wallet-action share-reward');
  });

  it('uses a dedicated reward invitation page and native share actions', () => {
    expect(profile).toContain("'/pages/share-reward/index'");
    expect(reward).toContain("shareService.create({ kind: 'reward', showIdentity: true })");
    expect(reward).toContain('page.rewardShare()');
    expect(reward).toContain('onShareTimeline');
    expect(reward).toContain('onShareAppMessage');
    expect(reward).toContain('保存海报');
  });
});
