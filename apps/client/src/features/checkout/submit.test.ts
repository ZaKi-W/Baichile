import { describe, expect, it } from 'vitest';
import { virtualBalancePaymentCents } from './submit';

describe('checkout payment projection', () => {
  it('never treats a guest-simulation order recovered after login as a balance payment', () => {
    expect(virtualBalancePaymentCents({
      settlementMode: 'guest_simulation',
      totalCents: 1800,
    })).toBe(0);
    expect(virtualBalancePaymentCents({
      settlementMode: 'virtual_balance',
      totalCents: 1800,
    })).toBe(1800);
  });
});
