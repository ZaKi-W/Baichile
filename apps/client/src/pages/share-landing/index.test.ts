import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./index.vue', import.meta.url),
  'utf8',
);

describe('share landing poster', () => {
  it('uses finished cover assets without runtime canvas rendering', () => {
    expect(source).not.toContain('<canvas');
    expect(source).not.toContain('canvasToTempFilePath');
    expect(source).toContain('posterUrl.value = buildSharePosterModel(data.value).background');
  });

  it('does not repeat poster copy below the poster preview', () => {
    expect(source).not.toContain('class="numbers"');
    expect(source).not.toContain('class="eyebrow"');
    expect(source).not.toContain('class="benefit"');
  });

  it('shows the claim action only to invited visitors', () => {
    expect(source).toContain('v-if="!sharing"');
  });

  it('does not block landing data on poster generation', () => {
    expect(source).not.toContain('onReady(');
    expect(source).not.toContain('renderPoster(');
  });
});
