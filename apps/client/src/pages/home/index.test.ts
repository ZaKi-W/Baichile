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
    expect(source).toContain('onUnload(stopCarousel)');
    expect(source).toContain('data.categories.slice(0, 8)');
    expect(source).toContain(':index="index"');
    expect(source).not.toContain('今晚想吃什么');
    expect(source).not.toContain('class="card topic"');
    expect(source).not.toContain('.topic {');
  });
});
