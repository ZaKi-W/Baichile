import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('SkuSheet mini-program event boundary', () => {
  it('stops taps inside the sheet from reaching the closing backdrop', () => {
    const source = readFileSync(new URL('./SkuSheet.vue', import.meta.url), 'utf8');
    expect(source).toContain('class="sheet" @tap.stop');
    expect(source).not.toContain('@tap.self');
  });
});

