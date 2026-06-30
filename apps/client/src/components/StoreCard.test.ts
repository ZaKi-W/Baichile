import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('StoreCard merchant metrics', () => {
  it('matches the reference hierarchy with a large square cover and compact information rows', () => {
    const source = readFileSync(new URL('./StoreCard.vue', import.meta.url), 'utf8');

    expect(source).not.toContain('{{ store.description }}');
    expect(source).toContain('class="merchant-meta"');
    expect(source).toContain('class="fulfilment"');
    expect(source).toContain('class="reputation"');
    expect(source).toContain('最近24小时{{ store.recentViewers }}人看过');
    expect(source).toContain('.cover { flex: 0 0 180rpx; width: 180rpx; height: 180rpx;');
    expect(source).toContain('text-overflow: ellipsis; white-space: nowrap;');

    const heading = source.slice(source.indexOf('class="heading"'), source.indexOf('class="merchant-meta"'));
    const reputation = source.slice(source.indexOf('class="reputation"'), source.indexOf('class="tags"'));
    expect(heading).not.toContain('store.rating');
    expect(reputation).toContain('store.rating.toFixed(1)');
  });
});
