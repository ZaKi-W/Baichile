import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('cart tab page', () => {
  it('renders the cart workflow in the former discover tab', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('useCartStore');
    expect(source).toContain('购物车');
    expect(source).toContain('const groups = computed(() => cart.groups)');
    expect(source).toContain('v-for="group in groups"');
    expect(source).toContain('合并结算');
    expect(source).toContain('cart.allTotalCents');
    expect(source).toContain('cart.allCount');
    expect(source).toContain('cart.updateQuantity');
    expect(source).toContain('cart.clear');
    expect(source).toContain('/pages/checkout/index');
    expect(source).toContain('去首页选餐');
    expect(source).toContain('class="safe-top"');
    expect(source).toContain('const systemInfo = uni.getSystemInfoSync()');
    expect(source).toContain('uni.getMenuButtonBoundingClientRect()');
    expect(source).toContain(':style="safeTopStyle"');
  });
});
