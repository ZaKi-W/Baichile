import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PERSONALITIES, PERSONALITY_IMAGE_BASE_URL } from '../../features/personality-test/personas';
import { PERSONALITY_CODES } from '../../features/personality-test/types';

describe('personality result imagery', () => {
  it('uses one CDN image for every personality and no bundled static fallback', () => {
    const source = readFileSync(new URL('./PersonalityResultCard.vue', import.meta.url), 'utf8');
    expect(source).toContain(':src="PERSONALITIES[result.primaryCode].imageUrl"');
    expect(source).not.toContain('/static/');
    PERSONALITY_CODES.forEach((code) => {
      expect(PERSONALITIES[code].imageUrl).toBe(`${PERSONALITY_IMAGE_BASE_URL}/${code}.png`);
    });
  });
});
