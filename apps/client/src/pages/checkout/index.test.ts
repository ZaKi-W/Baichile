import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('checkout wallet payment', () => {
  it('keeps Mini Program login gating while allowing H5 guest simulation', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('if (!auth.accountId && !isWebPlatform())');
    expect(source).toContain('savePendingOrder(requests.value)');
    expect(source).toContain('for (const group of checkoutGroups.value)');
    expect(source).toContain('completedStoreIds.push(group.store.id)');
    expect(source).toContain('已生成${created.length}个订单');
    expect(source).toContain('登录后将自动提交订单');
    expect(source).toContain("error.code === 'INSUFFICIENT_BALANCE'");
    expect(source).toContain('余额不足');
    expect(source).toContain('仅扣除应用内虚拟余额，不涉及真实支付');
    expect(source).toContain('游客试玩不会扣除虚拟余额');
    expect(source).toContain('新用户已安排默认收货点，点此可换成自己的');
  });
});
