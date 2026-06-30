import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('store page cart interaction', () => {
  it('opens cart details from the summary without hijacking checkout', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain("import CartSheet from '../../components/CartSheet.vue'");
    expect(source).toContain('const isCartOpen = ref(false)');
    expect(source).toContain('if (canCheckout.value) isCartOpen.value = true');
    expect(source).toContain('class="cart-summary" @tap="openCart"');
    expect(source).toContain('@tap="checkout"');
    expect(source).toContain(':visible="isCartOpen"');
    expect(source).toContain(':lines="cart.lines"');
    expect(source).toContain('@close="isCartOpen = false"');
  });
});
