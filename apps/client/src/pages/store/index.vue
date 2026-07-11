<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import type { MenuItem, StoreDetail } from '@baichile/api-contract';
import AppIcon from '../../components/AppIcon.vue';
import CartSheet from '../../components/CartSheet.vue';
import SkuSheet from '../../components/SkuSheet.vue';
import { catalogService } from '../../services/catalog';
import { useCartStore } from '../../stores/cart';

const store = ref<StoreDetail>();
const selected = ref<MenuItem | null>(null);
const isCartOpen = ref(false);
const cart = useCartStore();
const activeCategoryId = ref('');
const scrollAnchor = ref('');
const sectionOffsets = new Map<string, number>();
const failedImages = ref<string[]>([]);
let isProgrammatic = false;

onLoad(async (options) => {
  store.value = await catalogService.store(options?.id || '');
  cart.selectStore(store.value);
  const flashSaleItem = options?.flashSaleItemId
    ? store.value.menu.find((item) => item.id === options.flashSaleItemId)
    : undefined;
  if (flashSaleItem?.subCategoryId) {
    activeCategoryId.value = flashSaleItem.subCategoryId;
    scrollAnchor.value = `cat-${flashSaleItem.subCategoryId}`;
  }
  if (flashSaleItem && await cart.add(store.value, flashSaleItem, flashSaleOptionIds(flashSaleItem), 1)) {
    uni.showToast({ title: '已抢到，已加入购物车', icon: 'none' });
  }
  await nextTick();
  setTimeout(measureSections, 200);
});

const hasCartItems = computed(() => cart.count > 0);
const meetsMinimumOrder = computed(() => !store.value || cart.itemsTotalCents >= store.value.minimumOrderCents);
const canCheckout = computed(() => cart.count > 0 && meetsMinimumOrder.value);
const checkoutText = computed(() => {
  if (!cart.count) return '购物车为空';
  if (!meetsMinimumOrder.value && store.value) {
    const missing = Math.max(0, store.value.minimumOrderCents - cart.itemsTotalCents);
    return `差¥${(missing / 100).toFixed(0)}起送`;
  }
  return '去结算';
});
const menuGroups = computed(() => {
  const subs = store.value?.subCategories;
  if (!subs?.length) return [];
  const map = new Map<string, MenuItem[]>();
  for (const item of store.value?.menu ?? []) {
    const sub = item.subCategoryId ?? subs[0].id;
    const items = map.get(sub) ?? [];
    items.push(item);
    map.set(sub, items);
  }
  return subs.filter((s) => map.has(s.id)).map((s) => ({ id: s.id, name: s.name, items: map.get(s.id)! }));
});
const storeInitial = computed(() => store.value?.name.slice(-1) || '食');
const imageVisible = (id: string, url?: string) => Boolean(url && !failedImages.value.includes(id));
const markImageFailed = (id: string) => {
  if (!failedImages.value.includes(id)) failedImages.value = [...failedImages.value, id];
};
const requiresSpecSelection = (item: MenuItem) => item.specGroups.some((group) => group.options.length > 1);
const directOptionIds = (item: MenuItem) => item.specGroups.flatMap((group) => {
  const defaults = group.options.filter((option) => option.isDefault).map((option) => option.id);
  if (defaults.length) return defaults;
  return group.options.length === 1 ? [group.options[0].id] : [];
});
const flashSaleOptionIds = (item: MenuItem) => item.specGroups.flatMap((group) => {
  const defaults = group.options.filter((option) => option.isDefault).map((option) => option.id);
  if (defaults.length) return defaults;
  return group.required && group.options[0] ? [group.options[0].id] : [];
});

function measureSections() {
  uni.createSelectorQuery()
    .selectAll('.menu-section')
    .boundingClientRect((result) => {
      const rects = Array.isArray(result) ? result : [result];
      if (!rects.length) return;
      sectionOffsets.clear();
      const firstTop = rects[0]?.top ?? 0;
      rects.forEach((rect: any) => {
        const id = rect.id?.replace('cat-', '');
        if (id) sectionOffsets.set(id, (rect.top ?? firstTop) - firstTop);
      });
    })
    .exec();
}

function onMenuScroll(e: any) {
  if (isProgrammatic) return;
  const scrollTop: number = e.detail.scrollTop;
  let current = menuGroups.value[0]?.id ?? '';
  for (const [id, offset] of sectionOffsets) {
    if (offset <= scrollTop + 30) current = id;
  }
  if (current && current !== activeCategoryId.value) {
    activeCategoryId.value = current;
  }
}

function selectCategory(id: string) {
  activeCategoryId.value = id;
  isProgrammatic = true;
  scrollAnchor.value = '';
  nextTick(() => {
    scrollAnchor.value = `cat-${id}`;
    setTimeout(() => { isProgrammatic = false; }, 500);
  });
}

async function add(optionIds: string[], quantity: number) {
  if (!store.value || !selected.value) return;
  if (await cart.add(store.value, selected.value, optionIds, quantity)) {
    selected.value = null;
    uni.showToast({ title: '已加入购物车', icon: 'none' });
  }
}
async function addItem(item: MenuItem) {
  if (!store.value) return;
  if (requiresSpecSelection(item)) {
    selected.value = item;
    return;
  }
  if (await cart.add(store.value, item, directOptionIds(item), 1)) {
    uni.showToast({ title: '已加入购物车', icon: 'none' });
  }
}
function openCart() {
  if (hasCartItems.value) isCartOpen.value = true;
}
function removeFromCart(key: string) {
  cart.remove(key);
  if (!cart.lines.length) isCartOpen.value = false;
}
function changeCartQuantity(key: string, delta: number) {
  const line = cart.lines.find((item) => item.key === key);
  if (!line) return;
  cart.updateQuantity(key, line.quantity + delta);
  if (!cart.lines.length) isCartOpen.value = false;
}
function clearCart() {
  if (store.value) cart.clear(store.value.id);
  isCartOpen.value = false;
}
const checkout = () => {
  if (!canCheckout.value || !store.value) return;
  uni.navigateTo({ url: `/pages/checkout/index?storeId=${store.value.id}` });
};
</script>

<template>
  <view v-if="store" class="page store-page">
    <view class="merchant-hero">
      <image v-if="imageVisible('store-cover', store.coverUrl)" class="merchant-cover" :src="store.coverUrl" mode="aspectFill" @error="markImageFailed('store-cover')" />
      <view v-if="imageVisible('store-cover', store.coverUrl)" class="merchant-cover-shade" />
      <view class="hero-decoration">{{ storeInitial }}</view>
      <view class="merchant-content">
        <view class="store-logo">
          <image v-if="imageVisible('store-logo', store.coverUrl)" :src="store.coverUrl" mode="aspectFill" @error="markImageFailed('store-logo')" />
          <text v-else>{{ storeInitial }}</text>
        </view>
        <view class="merchant-main">
          <view class="merchant-title-row">
            <text class="merchant-name">{{ store.name }}</text>
            <text class="verified">✓</text>
          </view>
          <text class="merchant-subtitle">{{ store.description }}</text>
        </view>
      </view>

      <view class="merchant-meta">
        <text><text class="meta-strong">{{ store.rating.toFixed(1) }}</text> 分</text>
        <text class="meta-dot"></text>
        <text>月售 {{ store.monthlySales }}+</text>
        <text class="meta-dot"></text>
        <text>{{ store.virtualDeliveryMinutes }} 分钟</text>
        <text class="meta-dot"></text>
        <text>{{ store.distanceKm.toFixed(1) }} km</text>
      </view>

      <view class="notice-row">
        <text class="notice-sign">i</text>
        <text>本店与菜单均为虚拟内容，不会真实接单或配送。</text>
      </view>
    </view>

    <scroll-view class="service-strip" scroll-x :show-scrollbar="false">
      <view class="service-items">
        <view class="service-item">起送 <text>¥{{ (store.minimumOrderCents / 100).toFixed(0) }}</text></view>
        <view class="service-item">配送 <text>{{ store.deliveryFeeCents ? `¥${(store.deliveryFeeCents / 100).toFixed(0)}` : '免配送费' }}</text></view>
        <view class="service-item">准时达</view>
        <view class="service-item">食材现做</view>
      </view>
    </scroll-view>

    <view class="menu-layout">
      <scroll-view class="category-sidebar" scroll-y :show-scrollbar="false">
        <view
          v-for="group in menuGroups"
          :key="group.id"
          class="category-button"
          :class="{ active: group.id === (activeCategoryId || menuGroups[0]?.id) }"
          @tap="selectCategory(group.id)"
        >
          <text>{{ group.name }}</text>
          <text class="category-count">{{ group.items.length }} 件</text>
        </view>
      </scroll-view>

      <scroll-view class="menu-content" scroll-y :show-scrollbar="false" :scroll-into-view="scrollAnchor" scroll-with-animation @scroll="onMenuScroll">
        <view v-if="!menuGroups.length" class="empty-menu">菜单正在准备中</view>
        <view v-for="group in menuGroups" :key="group.id" :id="`cat-${group.id}`" class="menu-section">
          <view class="menu-section-title-row">
            <text class="menu-section-title">{{ group.name }}</text>
            <text class="menu-section-note">每日现做</text>
          </view>

          <view v-for="(item, itemIndex) in group.items" :key="item.id" class="product-card">
            <view class="product-visual" :class="`visual-${itemIndex % 4}`">
              <image v-if="imageVisible(item.id, item.imageUrl)" class="product-image" :src="item.imageUrl" mode="aspectFill" @error="markImageFailed(item.id)" />
              <text v-else class="food-glyph">{{ item.name.slice(-1) }}</text>
            </view>
            <view class="product-info">
              <text class="product-name">{{ item.name }}</text>
              <text v-if="item.subtitle" class="product-desc">{{ item.subtitle }}</text>
              <text class="product-sales">月售 {{ item.monthlySales }}</text>
              <view class="product-bottom">
                <view class="product-price">
                  <text class="price-symbol">¥</text>{{ (item.basePriceCents / 100).toFixed(2) }}
                  <text class="price-from">起</text>
                </view>
                <button class="product-add" :class="{ 'has-spec': requiresSpecSelection(item) }" @tap="addItem(item)">
                  {{ requiresSpecSelection(item) ? '选规格' : '＋' }}
                </button>
              </view>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>

    <view class="cart-bar" :class="{ disabled: !hasCartItems }" @tap="openCart">
      <view class="cart-trigger">
        <AppIcon name="cart" :size="23" />
        <text v-if="cart.count" class="cart-badge">{{ cart.count }}</text>
      </view>
      <view class="cart-summary">
        <text class="cart-total">¥{{ (cart.totalCents / 100).toFixed(2) }}</text>
        <text class="cart-note">{{ cart.count ? `已选 ${cart.count} 件` : '购物车还是空的' }}</text>
      </view>
      <button class="checkout-button" :disabled="!canCheckout" @tap.stop="checkout">{{ checkoutText }}</button>
    </view>
    <SkuSheet :item="selected" @close="selected = null" @confirm="add" />
    <CartSheet
      :visible="isCartOpen"
      :lines="cart.lines"
      :store-name="cart.store?.name"
      :total-cents="cart.totalCents"
      :checkout-disabled="!canCheckout"
      :checkout-text="checkoutText"
      @close="isCartOpen = false"
      @remove="removeFromCart"
      @increase="changeCartQuantity($event, 1)"
      @decrease="changeCartQuantity($event, -1)"
      @clear="clearCart"
      @checkout="checkout"
    />
  </view>
</template>

<style scoped>
.store-page {
  --ink: #151515;
  --muted: #83837f;
  --line: rgba(20, 20, 20, .08);
  --lime: #dff75a;
  --accent: #ff5b38;
  min-height: 100vh;
  padding: 28rpx 28rpx calc(196rpx + env(safe-area-inset-bottom));
  overflow: hidden;
  background: #f7f7f5;
  color: var(--ink);
}

.merchant-hero {
  position: relative;
  min-height: 398rpx;
  padding: max(24rpx, env(safe-area-inset-top)) 30rpx 28rpx;
  overflow: hidden;
  box-sizing: border-box;
  border-radius: 52rpx;
  color: #fff;
  background:
    radial-gradient(circle at 81% 18%, rgba(223, 247, 90, .98) 0 10%, transparent 10.5%),
    radial-gradient(circle at 79% 21%, rgba(223, 247, 90, .2) 0 25%, transparent 25.5%),
    linear-gradient(139deg, #151515 3%, #263631 58%, #2f463b 100%);
  box-shadow: 0 30rpx 76rpx rgba(21, 21, 18, .16);
}
.merchant-hero::before {
  content: "";
  position: absolute;
  right: -105rpx;
  bottom: -150rpx;
  width: 390rpx;
  height: 390rpx;
  border: 2rpx solid rgba(255, 255, 255, .13);
  border-radius: 80rpx;
  transform: rotate(28deg);
  box-shadow: inset 0 0 0 60rpx rgba(255, 255, 255, .025);
}
.merchant-cover { position: absolute; inset: 0; width: 100%; height: 100%; }
.merchant-cover-shade { position: absolute; inset: 0; background: linear-gradient(110deg, rgba(10, 16, 13, .92), rgba(10, 16, 13, .62) 60%, rgba(10, 16, 13, .34)); }
.hero-decoration {
  position: absolute;
  right: 18rpx;
  bottom: -42rpx;
  color: rgba(255, 255, 255, .08);
  font-size: 270rpx;
  line-height: 1;
  font-weight: 900;
  transform: rotate(-8deg);
}
.product-add::after, .checkout-button::after { border: 0; }
.merchant-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  gap: 22rpx;
  margin-top: 28rpx;
}
.store-logo {
  width: 118rpx;
  height: 118rpx;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 2rpx solid rgba(255, 255, 255, .5);
  border-radius: 40rpx;
  color: #19291f;
  background: linear-gradient(145deg, #f3ffbe, var(--lime));
  box-shadow: 0 22rpx 40rpx rgba(0, 0, 0, .18), inset 0 2rpx 0 rgba(255, 255, 255, .72);
  font-size: 54rpx;
  font-weight: 900;
  transform: rotate(-3deg);
}
.store-logo image { width: 100%; height: 100%; border-radius: inherit; }
.merchant-main { min-width: 0; flex: 1; padding-top: 4rpx; }
.merchant-title-row { display: flex; align-items: center; gap: 10rpx; min-width: 0; }
.merchant-name {
  overflow: hidden;
  color: #fff;
  font-size: 42rpx;
  line-height: 1.1;
  font-weight: 900;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.verified {
  width: 30rpx;
  height: 30rpx;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: #111;
  border-radius: 10rpx;
  background: var(--lime);
  font-size: 18rpx;
  font-weight: 900;
}
.merchant-subtitle {
  display: -webkit-box;
  margin-top: 10rpx;
  overflow: hidden;
  color: rgba(255, 255, 255, .66);
  font-size: 22rpx;
  line-height: 1.35;
  font-weight: 600;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.merchant-meta {
  position: relative;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10rpx 14rpx;
  margin: 26rpx 0 0 140rpx;
  color: rgba(255, 255, 255, .84);
  font-size: 20rpx;
  font-weight: 650;
}
.meta-strong { color: #fff; font-weight: 900; }
.meta-dot { width: 6rpx; height: 6rpx; border-radius: 50%; background: rgba(255, 255, 255, .35); }
.notice-row {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 25rpx;
  padding: 17rpx 20rpx;
  border: 2rpx solid rgba(255, 255, 255, .12);
  border-radius: 25rpx;
  color: rgba(255, 255, 255, .72);
  background: rgba(0, 0, 0, .13);
  font-size: 20rpx;
  line-height: 1.25;
}
.notice-sign {
  width: 32rpx;
  height: 32rpx;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 10rpx;
  color: #1d2b1f;
  background: var(--lime);
  font-size: 20rpx;
  font-weight: 800;
}

.service-strip {
  width: 100%;
  margin-top: 22rpx;
  padding: 16rpx 18rpx;
  box-sizing: border-box;
  border: 2rpx solid var(--line);
  border-radius: 32rpx;
  background: rgba(255, 255, 255, .94);
  box-shadow: 0 14rpx 32rpx rgba(20, 20, 20, .04);
  white-space: nowrap;
}
.service-items { display: inline-flex; gap: 14rpx; }
.service-item {
  height: 52rpx;
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 0 18rpx;
  border-radius: 20rpx;
  color: #555552;
  background: #f4f4f1;
  font-size: 20rpx;
  font-weight: 700;
}
.service-item text { color: var(--ink); font-weight: 900; }

.menu-layout {
  min-height: calc(100vh - 650rpx);
  display: flex;
  align-items: stretch;
  margin-top: 22rpx;
  overflow: hidden;
  border: 2rpx solid var(--line);
  border-radius: 44rpx;
  background: #fff;
  box-shadow: 0 20rpx 48rpx rgba(21, 21, 18, .07);
}
.category-sidebar {
  width: 160rpx;
  height: calc(100vh - 650rpx);
  flex: 0 0 auto;
  padding: 20rpx 14rpx 150rpx;
  box-sizing: border-box;
  background: #f0f0ed;
}
.category-button {
  position: relative;
  min-height: 92rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 14rpx 10rpx;
  box-sizing: border-box;
  border-radius: 24rpx;
  color: #7b7b78;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1.2;
}
.category-button.active {
  color: var(--ink);
  background: #fff;
  box-shadow: 0 9rpx 24rpx rgba(20, 20, 20, .05);
  font-weight: 900;
}
.category-button.active::before {
  content: "";
  position: absolute;
  left: -14rpx;
  top: 28rpx;
  width: 6rpx;
  height: 40rpx;
  border-radius: 8rpx;
  background: var(--accent);
}
.category-count { margin-top: 6rpx; color: #aaa9a5; font-size: 17rpx; font-weight: 600; }
.menu-content { min-width: 0; flex: 1; height: calc(100vh - 650rpx); padding: 0 18rpx 60rpx; background: #fff; }
.menu-section { padding-top: 32rpx; }
.menu-section + .menu-section { margin-top: 10rpx; }
.menu-section-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12rpx;
  margin-bottom: 20rpx;
}
.menu-section-title { font-size: 34rpx; line-height: 1; font-weight: 900; }
.menu-section-note { color: #9a9a97; font-size: 18rpx; font-weight: 600; }
.empty-menu { padding: 80rpx 20rpx; color: var(--muted); text-align: center; font-size: 24rpx; }

.product-card {
  position: relative;
  min-height: 190rpx;
  display: flex;
  gap: 18rpx;
  padding: 18rpx;
  box-sizing: border-box;
  border-radius: 32rpx;
  background: #fafaf8;
  box-shadow: inset 0 0 0 2rpx rgba(20, 20, 20, .055);
}
.product-card + .product-card { margin-top: 16rpx; }
.product-visual {
  position: relative;
  width: 150rpx;
  height: 150rpx;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 30rpx;
  box-shadow: inset 0 0 0 2rpx rgba(0, 0, 0, .04), 0 14rpx 32rpx rgba(20, 20, 20, .06);
}
.product-visual::before {
  content: "";
  position: absolute;
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, .32);
}
.visual-0 { background: linear-gradient(145deg, #e3c794, #b26b3e); }
.visual-1 { background: linear-gradient(145deg, #ffded2, #f49c80); }
.visual-2 { background: linear-gradient(145deg, #faebb1, #d7ae55); }
.visual-3 { background: linear-gradient(145deg, #d4ebff, #90baf5); }
.product-image { position: relative; z-index: 1; width: 100%; height: 100%; }
.food-glyph {
  position: relative;
  z-index: 1;
  color: rgba(35, 25, 15, .76);
  font-size: 66rpx;
  font-weight: 900;
  text-shadow: 0 10rpx 8rpx rgba(0, 0, 0, .13);
}
.product-info {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding-top: 2rpx;
}
.product-name {
  max-width: 100%;
  overflow: hidden;
  font-size: 27rpx;
  line-height: 1.2;
  font-weight: 900;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.product-desc {
  display: -webkit-box;
  margin-top: 8rpx;
  overflow: hidden;
  color: #90908d;
  font-size: 19rpx;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.product-sales { margin-top: 7rpx; color: #a9a9a5; font-size: 17rpx; font-weight: 600; }
.product-bottom {
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 12rpx;
}
.product-price { color: var(--accent); font-size: 25rpx; line-height: 1; font-weight: 900; white-space: nowrap; }
.price-symbol { margin-right: 2rpx; font-size: 17rpx; }
.price-from { margin-left: 4rpx; color: #a9a9a5; font-size: 16rpx; font-weight: 600; }
.product-add {
  min-width: 52rpx;
  height: 52rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0 12rpx;
  border-radius: 20rpx;
  color: #171717;
  background: var(--lime);
  box-shadow: 0 9rpx 20rpx rgba(120, 140, 26, .17);
  font-size: 30rpx;
  font-weight: 900;
  line-height: 1;
}
.product-add.has-spec { min-width: 96rpx; font-size: 19rpx; }

.cart-bar {
  position: fixed;
  z-index: 20;
  left: 28rpx;
  right: 28rpx;
  bottom: calc(24rpx + env(safe-area-inset-bottom));
  min-height: 104rpx;
  display: flex;
  align-items: center;
  padding: 12rpx 12rpx 12rpx 18rpx;
  box-sizing: border-box;
  border: 2rpx solid rgba(255, 255, 255, .1);
  border-radius: 999rpx;
  color: #fff;
  background: rgba(23, 23, 22, .97);
  box-shadow: 0 24rpx 60rpx rgba(20, 20, 18, .25);
}
.cart-trigger {
  position: relative;
  width: 72rpx;
  height: 72rpx;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #1a1a19;
  background: var(--lime);
}
.cart-badge {
  position: absolute;
  top: -8rpx;
  right: -6rpx;
  min-width: 30rpx;
  height: 30rpx;
  padding: 0 5rpx;
  box-sizing: border-box;
  border: 3rpx solid #171716;
  border-radius: 999rpx;
  color: #fff;
  background: var(--accent);
  font-size: 17rpx;
  line-height: 27rpx;
  text-align: center;
}
.cart-summary {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 18rpx;
}
.cart-total { font-size: 30rpx; line-height: 1.1; font-weight: 900; }
.cart-note { margin-top: 6rpx; color: rgba(255, 255, 255, .56); font-size: 18rpx; font-weight: 600; }
.checkout-button {
  height: 72rpx;
  min-width: 142rpx;
  margin: 0;
  padding: 0 24rpx;
  border-radius: 999rpx;
  color: #171717;
  background: var(--lime);
  font-size: 25rpx;
  line-height: 72rpx;
  font-weight: 900;
}
.checkout-button[disabled] { color: rgba(255, 255, 255, .45); background: #454542; }
.cart-bar.disabled { opacity: .88; }

@media (max-width: 370px) {
  .store-page { padding-right: 20rpx; padding-left: 20rpx; }
  .category-sidebar { width: 138rpx; padding-right: 10rpx; padding-left: 10rpx; }
  .category-button { font-size: 20rpx; }
  .menu-content { padding-right: 12rpx; padding-left: 12rpx; }
  .product-card { gap: 14rpx; padding: 14rpx; }
  .product-visual { width: 128rpx; height: 128rpx; }
  .product-name { font-size: 25rpx; }
  .product-add.has-spec { min-width: 82rpx; padding: 0 8rpx; font-size: 17rpx; }
  .merchant-meta { margin-left: 0; }
}
</style>
