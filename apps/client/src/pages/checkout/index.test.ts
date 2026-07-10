import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('checkout wallet payment', () => {
  it('requires login and preserves the specific insufficient balance error', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('if (!auth.accountId)');
    expect(source).toContain('savePendingOrder(requests.value)');
    expect(source).toContain('for (const group of checkoutGroups.value)');
    expect(source).toContain('completedStoreIds.push(group.store.id)');
    expect(source).toContain('已生成${created.length}个订单');
    expect(source).toContain('登录后将自动提交订单');
    expect(source).toContain("error.code === 'INSUFFICIENT_BALANCE'");
    expect(source).toContain('余额不足');
    expect(source).toContain('仅扣除应用内虚拟余额，不涉及真实支付');
  });
});
