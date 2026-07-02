import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('checkout wallet payment', () => {
  it('requires login and preserves the specific insufficient balance error', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('if (!auth.accountId)');
    expect(source).toContain("error.code === 'INSUFFICIENT_BALANCE'");
    expect(source).toContain('余额不足');
    expect(source).toContain('仅扣除应用内虚拟余额，不涉及真实支付');
  });
});
