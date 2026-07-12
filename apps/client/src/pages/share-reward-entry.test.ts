import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const home = readFileSync(new URL('./home/index.vue', import.meta.url), 'utf8');
const profile = readFileSync(new URL('./profile/index.vue', import.meta.url), 'utf8');
const landing = readFileSync(new URL('./share-landing/index.vue', import.meta.url), 'utf8');

describe('share reward entry points', () => {
  it('promotes the share reward from home and profile', () => {
    expect(home).not.toContain('分享朋友圈，领虚拟饭钱');
    expect(profile).toContain('测测我的白吃人格');
    expect(profile).toContain('wallet-action share-reward');
  });

  it('requests the reward from native share actions', () => {
    expect(landing).toContain('shareService.reward(token.value)');
    expect(landing).toContain('onShareTimeline');
    expect(landing).toContain('onShareAppMessage');
  });
});
