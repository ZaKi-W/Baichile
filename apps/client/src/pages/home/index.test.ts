import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('home page sections', () => {
  it('renders categories followed by the flash sale module without restoring the removed banner', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).not.toContain('class="topbar"');
    expect(source).not.toContain('openLocationPicker');
    expect(source).not.toContain('location.locate()');
    expect(source).toContain('class="search-wrap"');
    expect(source).toContain('class="category-grid"');
    expect(source).toContain('class="flash-sale-section"');
    expect(source).toContain('const flashSaleItems = computed(() => data.value?.flashSaleItems ?? [])');
    expect(source).toContain('v-if="flashSaleItems.length"');
    expect(source).toContain('class="flash-sale-countdown"');
    expect(source).toContain('class="filter-row"');
    expect(source).toContain('class="route-note"');
    expect(source).toContain('uni.getSystemInfoSync().statusBarHeight');
    expect(source).toContain(':style="safeTopStyle"');
    expect(source).not.toContain('class="profile-button"');
    expect(source).not.toContain('const openProfile');
    expect(source).not.toContain('class="hero"');
    expect(source).not.toContain('heroSlides');
    expect(source).not.toContain('startCarousel');
    expect(source).not.toContain('排序 ⇅');
    expect(source).toContain('.filter-chip { flex: 0 0 auto; min-height: 64rpx; display: inline-flex; align-items: center; justify-content: center;');
    expect(source).toContain('onUnload(handleHide)');
    expect(source).toContain('data.categories.slice(0, 8)');
    expect(source).toContain(':index="index"');
    expect(source).not.toContain('今晚想吃什么');
    expect(source).not.toContain('class="card topic"');
    expect(source).not.toContain('.topic {');
  });

  it('starts a fresh fake countdown and cleans up its timer with other home timers', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('HomeOrderCarousel');
    expect(source).toContain('startFlashSaleTimer');
    expect(source).toContain('stopFlashSaleTimer');
    expect(source).toContain('10 * 60 * 60 + Math.floor(Math.random() * 8 * 60 * 60)');
    expect(source).toContain('flashSaleSeconds.value = Math.max(0, flashSaleSeconds.value - 1)');
    expect(source).toContain('flashSaleItemId=${item.menuItemId}');
    expect(source).toContain('orders.load()');
    expect(source).toContain('startOrderTimer');
    expect(source).toContain('stopOrderTimer');
    expect(source).toContain('homeOrderSeenKey');
    expect(source).toContain('refreshFailedIncidentRefunds');
    expect(source).toContain('sessionOrderIds');
    expect(source).toContain('!summary.terminal');
  });
});
