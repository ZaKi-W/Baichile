import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('delivery page status initialization', () => {
  it('restores the current order step before waiting for store details', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');
    const onLoadBody = source.slice(source.indexOf('onLoad(async'));

    expect(onLoadBody.indexOf('startStepTimer();')).toBeLessThan(
      onLoadBody.indexOf('await resolveStoreInfo();'),
    );
  });
});
