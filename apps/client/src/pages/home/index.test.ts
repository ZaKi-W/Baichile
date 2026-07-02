import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('home page sections', () => {
  it('renders the supplied hierarchy without restoring the removed topic card', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('class="topbar"');
    expect(source).toContain('class="search-wrap"');
    expect(source).toContain('class="hero"');
    expect(source).toContain('class="category-grid"');
    expect(source).toContain('class="filter-row"');
    expect(source).toContain('class="route-note"');
    expect(source).toContain('uni.getSystemInfoSync().statusBarHeight');
    expect(source).toContain(':style="safeTopStyle"');
    expect(source).not.toContain('class="profile-button"');
    expect(source).not.toContain('const openProfile');
    expect(source).not.toContain('class="hero-action"');
    expect(source).not.toContain('function runHeroAction');
    expect(source).not.toContain('排序 ⇅');
    expect(source).toContain('.filter-chip { flex: 0 0 auto; min-height: 64rpx; display: inline-flex; align-items: center; justify-content: center;');
    expect(source).toContain('onUnload(handleHide)');
    expect(source).toContain('data.categories.slice(0, 8)');
    expect(source).toContain(':index="index"');
    expect(source).not.toContain('今晚想吃什么');
    expect(source).not.toContain('class="card topic"');
    expect(source).not.toContain('.topic {');
  });

  it('loads and refreshes home order cards below the hero', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('HomeOrderCarousel');
    expect(source.indexOf('<HomeOrderCarousel')).toBeGreaterThan(source.indexOf('</section>'));
    expect(source).toContain('orders.load()');
    expect(source).toContain('startOrderTimer');
    expect(source).toContain('stopOrderTimer');
    expect(source).toContain('homeOrderSeenKey');
    expect(source).toContain('refreshFailedIncidentRefunds');
    expect(source).toContain('sessionOrderIds');
    expect(source).toContain('!summary.terminal');
  });
});
