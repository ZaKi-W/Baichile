import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('custom tab bar navigation', () => {
  it('registers four tabs including discover', () => {
    const pages = JSON.parse(readFileSync(new URL('../pages.json', import.meta.url), 'utf8'));
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(pages.pages).toContainEqual({
      path: 'pages/discover/index',
      style: { navigationStyle: 'custom' },
    });
    expect(pages.tabBar.list.map((item: { text: string }) => item.text)).toEqual(['首页', '发现', '订单', '我的']);
    expect(source).toContain("path: '/pages/discover/index'");
    expect(source).toContain("icon: 'discover'");
    expect(source).toContain('onShow(syncSelected)');
  });
});
