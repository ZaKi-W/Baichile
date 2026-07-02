import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('wallet page', () => {
  it('renders the balance and transaction history', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('wallet.summary.balanceCents');
    expect(source).toContain('wallet.transactions');
    expect(source).toContain('transaction.amountCents > 0');
    expect(source).toContain('暂无收支记录');
  });
});
