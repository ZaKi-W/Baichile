import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('store page cart interaction', () => {
  it('opens cart details from the summary without hijacking checkout', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain("import CartSheet from '../../components/CartSheet.vue'");
    expect(source).toContain('const isCartOpen = ref(false)');
    expect(source).toContain('const hasCartItems = computed(() => cart.count > 0)');
    expect(source).toContain('if (hasCartItems.value) isCartOpen.value = true');
    expect(source).toContain('class="cart-bar" :class="{ disabled: !hasCartItems }" @tap="openCart"');
    expect(source).toContain('@tap.stop="checkout"');
    expect(source).toContain(':visible="isCartOpen"');
    expect(source).toContain(':lines="cart.lines"');
    expect(source).toContain('@close="isCartOpen = false"');
    expect(source).toContain('@remove="removeFromCart"');
    expect(source).toContain('cart.remove(key)');
  });

  it('renders the complete merchant design structure around existing behavior', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('const menuGroups = computed');
    expect(source).toContain('class="merchant-hero"');
    expect(source).toContain('class="service-strip"');
    expect(source).toContain('class="menu-layout"');
    expect(source).toContain('class="category-sidebar"');
    expect(source).toContain('class="product-card"');
    expect(source).toContain("item.specGroups.length ? '选规格' : '＋'");
    expect(source).toContain('@tap="goBack"');
  });

  it('shows each menu item monthly sales', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('月售 {{ item.monthlySales }}');
  });
});
