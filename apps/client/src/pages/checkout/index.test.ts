import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('checkout wallet payment', () => {
  it('quotes the whole checkout and keeps a resumable per-store submission', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).not.toContain('if (!auth.accountId && !isWebPlatform())');
    expect(source).toContain('await auth.ensureGuest()');
    expect(source).toContain('checkoutService.quote(requests.value, {');
    expect(source).toContain('readActiveCheckoutId(checkoutSubject())');
    expect(source).toContain('createPendingCheckout(quote, checkoutSubject())');
    expect(source).toContain('submitPendingCheckout(pending)');
    expect(source).toContain('result.loginRequired');
    expect(source).toContain('登录后可继续，不会重复下单');
    expect(source).toContain('activeQuoteIsReusable(fingerprint)');
    expect(source).toContain('!activeQuoteSessionIsReusable()');
    expect(source).toContain('报价已更新，请确认金额后再次提交');
    expect(source).toContain('minimumGapCents');
    expect(source).toContain('eligibleStoreCount');
    expect(source).toContain('未达起送仍在购物车');
    expect(source).toContain("error.code === 'INSUFFICIENT_BALANCE'");
    expect(source).toContain('虚拟余额不足');
    expect(source).toContain('不产生真实支付或配送');
    expect(source).toContain('游客下单不扣余额');
    expect(source).toContain('新用户已安排默认收货点，点此可换成自己的');
    expect(source).toContain(": '提交订单'");
    expect(source).not.toContain('提交 ${eligibleStoreCount} 家订单');
  });
});
