import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('home page sections', () => {
  it('does not render the tonight recommendation card', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).not.toContain('今晚想吃什么');
    expect(source).not.toContain('class="card topic"');
    expect(source).not.toContain('.topic {');
  });
});
