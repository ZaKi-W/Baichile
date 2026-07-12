import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('personality question option identity', () => {
  it('does not reuse option nodes between different questions', () => {
    const source = readFileSync(new URL('./PersonalityQuestionCard.vue', import.meta.url), 'utf8');
    expect(source).toContain(':key="`${question.id}-${option.id}`"');
    expect(source).not.toContain('transition:transform .12s ease,background .12s ease');
  });
});
