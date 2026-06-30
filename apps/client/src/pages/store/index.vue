<script setup lang="ts">
import { computed, ref } from 'vue';
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
onLoad(async (options) => { store.value = await catalogService.store(options?.id || ''); });
const canCheckout = computed(() => cart.store?.id === store.value?.id && cart.count > 0);
async function add(optionIds: string[], quantity: number) {
  if (!store.value || !selected.value) return;
  if (await cart.add(store.value, selected.value, optionIds, quantity)) {
    selected.value = null;
    uni.showToast({ title: '已加入购物车', icon: 'none' });
  }
}
function openCart() {
  if (canCheckout.value) isCartOpen.value = true;
}
const checkout = () => uni.navigateTo({ url: '/pages/checkout/index' });
</script>

<template>
  <view v-if="store" class="page store-page">
    <view class="card header"><text class="title">{{ store.name }}</text><text class="muted">{{ store.description }}</text><view class="virtual-notice">本店与菜单均为虚拟内容，不会真实接单或配送。</view></view>
    <view v-for="item in store.menu" :key="item.id" class="card food">
      <view class="food-image">{{ item.name.slice(-2) }}</view>
      <view class="food-info"><text class="food-name">{{ item.name }}</text><text class="muted">{{ item.subtitle }}</text><text class="price">¥{{ (item.basePriceCents / 100).toFixed(2) }} 起</text></view>
      <button size="mini" class="add" @tap="selected = item"><AppIcon name="plus" :size="15" /></button>
    </view>
    <view class="cart-bar" :class="{ disabled: !canCheckout }" @tap="openCart">
      <view class="cart-summary"><AppIcon name="cart" :size="24" /><text>{{ cart.count }} 件 · ¥{{ (cart.totalCents / 100).toFixed(2) }}</text></view>
      <button class="primary-button" :disabled="!canCheckout" @tap.stop="checkout">去结算</button>
    </view>
    <SkuSheet :item="selected" @close="selected = null" @confirm="add" />
    <CartSheet :visible="isCartOpen" :lines="cart.lines" @close="isCartOpen = false" />
  </view>
</template>

<style scoped>
.store-page { padding-bottom: 150rpx; }
.header { display: flex; flex-direction: column; gap: 14rpx; }
.title { font-size: 38rpx; font-weight: 700; }
.food { display: flex; align-items: center; gap: 18rpx; }
.food-image { width: 120rpx; height: 120rpx; border-radius: 16rpx; background: #f2f2f2; display: flex; align-items: center; justify-content: center; }
.food-info { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
.food-name { font-weight: 600; }
.price { color: #d65523; font-weight: 700; }
.add { margin: 0; border-radius: 50%; }
.cart-bar { position: fixed; left: 24rpx; right: 24rpx; bottom: 24rpx; background: #222; color: #fff; border-radius: 999rpx; padding: 14rpx 16rpx 14rpx 24rpx; display: flex; align-items: center; justify-content: space-between; z-index: 20; }
.cart-summary { display: flex; flex: 1; align-items: center; align-self: stretch; gap: 12rpx; }
.cart-bar button { margin: 0; }
.disabled { opacity: .7; }
</style>
