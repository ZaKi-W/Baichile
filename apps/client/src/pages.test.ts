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
});
