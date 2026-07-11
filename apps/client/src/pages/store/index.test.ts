import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('store page cart interaction', () => {
  it('opens cart details from the summary without hijacking checkout', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain("import CartSheet from '../../components/CartSheet.vue'");
    expect(source).toContain('const isCartOpen = ref(false)');
    expect(source).toContain('const hasCartItems = computed(() => cart.count > 0)');
    expect(source).toContain('cart.selectStore(store.value)');
    expect(source).toContain('/pages/checkout/index?storeId=');
    expect(source).toContain('if (hasCartItems.value) isCartOpen.value = true');
    expect(source).toContain('class="cart-bar" :class="{ disabled: !hasCartItems }" @tap="openCart"');
    expect(source).toContain('@tap.stop="checkout"');
    expect(source).toContain(':visible="isCartOpen"');
    expect(source).toContain(':lines="cart.lines"');
    expect(source).toContain('@close="isCartOpen = false"');
    expect(source).toContain('@remove="removeFromCart"');
    expect(source).toContain('cart.remove(key)');
    expect(source).toContain('cart.clear(store.value.id)');
  });

  it('renders the complete merchant design structure around existing behavior', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('const menuGroups = computed');
    expect(source).toContain('class="merchant-hero"');
    expect(source).toContain("imageVisible('store-cover', store.coverUrl)");
    expect(source).toContain('class="merchant-cover"');
    expect(source).toContain('class="service-strip"');
    expect(source).toContain('class="menu-layout"');
    expect(source).toContain('class="category-sidebar"');
    expect(source).toContain('class="product-card"');
    expect(source).toContain("requiresSpecSelection(item) ? '选规格' : '＋'");
    expect(source).toContain('@error="markImageFailed(item.id)"');
  });

  it('adds dishes with a single available specification directly', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('const requiresSpecSelection = (item: MenuItem)');
    expect(source).toContain('return group.options.length === 1 ? [group.options[0].id] : []');
    expect(source).toContain('@tap="addItem(item)"');
    expect(source).toContain('cart.add(store.value, item, directOptionIds(item), 1)');
  });

  it('shows each menu item monthly sales', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('月售 {{ item.monthlySales }}');
  });

  it('positions and immediately adds a flash-sale dish when opened from home', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('options?.flashSaleItemId');
    expect(source).toContain('activeCategoryId.value = flashSaleItem.subCategoryId');
    expect(source).toContain('scrollAnchor.value = `cat-${flashSaleItem.subCategoryId}`');
    expect(source).toContain('const flashSaleOptionIds = (item: MenuItem)');
    expect(source).toContain('cart.add(store.value, flashSaleItem, flashSaleOptionIds(flashSaleItem), 1)');
    expect(source).toContain("uni.showToast({ title: '已抢到，已加入购物车', icon: 'none' })");
  });
});
