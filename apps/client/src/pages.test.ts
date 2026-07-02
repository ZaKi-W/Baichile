import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('native tab bar configuration', () => {
  it('uses the uni-app native tab bar for the four primary pages', () => {
    const pages = JSON.parse(readFileSync(new URL('./pages.json', import.meta.url), 'utf8'));

    expect(pages.tabBar.custom).toBeUndefined();
    expect(pages.tabBar.list.map((item: { text: string }) => item.text)).toEqual(['首页', '发现', '订单', '我的']);
  });

  it('registers the wallet page', () => {
    const pages = JSON.parse(readFileSync(new URL('./pages.json', import.meta.url), 'utf8'));
    expect(pages.pages).toContainEqual({
      path: 'pages/wallet/index',
      style: { navigationBarTitleText: '我的钱包' },
    });
  });

  it('shows code version 1 on the profile tab badge at launch', () => {
    const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');
    const version = readFileSync(new URL('./config/code-version.ts', import.meta.url), 'utf8');

    expect(version).toContain('CODE_VERSION = 1');
    expect(app).toContain('uni.setTabBarBadge');
    expect(app).toContain('index: 3');
    expect(app).toContain('text: String(CODE_VERSION)');
  });
});
