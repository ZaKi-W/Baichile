import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('home order carousel', () => {
  it('uses native swiper and exposes story, countdown, paging, and terminal close controls', () => {
    const source = readFileSync(new URL('./HomeOrderCarousel.vue', import.meta.url), 'utf8');

    expect(source).toContain('<swiper');
    expect(source).toContain('<swiper-item');
    expect(source).toContain('订单进行中');
    expect(source).toContain('incidentText');
    expect(source).toContain('配送彩蛋');
    expect(source).toContain('order-incident-badge');
    expect(source).toContain('remainingText');
    expect(source).toContain('activeIndex + 1');
    expect(source).toContain('订单进行中');
    expect(source).toContain('.order-card.incident { border-color: #f0a48f; background: #fff1ec; }');
    expect(source).not.toContain('v-if="summary.terminal"');
    expect(source).toContain("emit('dismiss'");
    expect(source).toContain("emit('open'");
  });
});
