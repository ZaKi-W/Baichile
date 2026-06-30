import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('discover page', () => {
  it('uses existing catalog data in the new tab', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('catalogService.home()');
    expect(source).toContain('发现好味道');
    expect(source).toContain('data.value?.featured');
    expect(source).toContain('data.categories');
    expect(source).toContain('<StoreCard');
    expect(source).toContain('class="safe-top"');
    expect(source).toContain('uni.getSystemInfoSync().statusBarHeight');
    expect(source).toContain(':style="safeTopStyle"');
  });
});
