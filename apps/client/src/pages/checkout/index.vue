<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { useCartStore, type CartStoreGroup } from '../../stores/cart';
import { useAddressStore } from '../../stores/address';
import { useAuthStore } from '../../stores/auth';
import { ApiRequestError } from '../../services/http';
import { isDefaultDeliveryAddress } from '../../config/default-delivery-address';
import { checkoutService } from '../../services/checkout';
import { trackEvent } from '../../services/analytics';
import type { CheckoutQuote, PendingCheckout } from '../../features/checkout/types';
import {
  checkoutSubject,
  ExpiredCheckoutError,
  reconcilePendingCheckout,
  submitPendingCheckout,
} from '../../features/checkout/submit';
import {
  clearActiveCheckoutSession,
  clearLegacyPendingOrders,
  clearPendingCheckout,
  createPendingCheckout,
  isPendingCheckoutExpired,
  isPendingCheckoutSessionExpired,
  pendingCheckoutMatchesRequests,
  pendingCheckoutMatchesSubject,
  pendingCheckoutHasWork,
  readActiveCheckoutId,
  readPendingCheckout,
  saveActiveCheckoutSession,
  savePendingCheckout,
} from '../../utils/pending-order';

const cart = useCartStore();
const addressStore = useAddressStore();
const auth = useAuthStore();
const submitting = ref(false);
const quoting = ref(false);
const quoteError = ref('');
const addressError = ref('');
const activeQuote = ref<CheckoutQuote>();
const activeQuoteFingerprint = ref('');
const checkoutStoreId = ref('');

const selectedAddress = computed(() => addressStore.selected);
const checkoutGroups = computed(() => {
  if (checkoutStoreId.value) {
    const group = cart.group(checkoutStoreId.value);
    return group ? [group] : [];
  }
  return cart.groups;
});
const checkoutTotalCents = computed(() => activeQuote.value?.totalCents
  ?? checkoutGroups.value.reduce((sum, group) => sum + group.totalCents, 0));
const quoteStores = computed(() => new Map(
  activeQuote.value?.stores.map((store) => [store.storeId, store.quote]) ?? [],
));
const storeShortfallCents = (group: CartStoreGroup) => {
  const quote = quoteStores.value.get(group.store.id);
  return quote?.minimumOrderShortfallCents
    ?? Math.max(
      0,
      (quote?.minimumOrderCents ?? group.store.minimumOrderCents)
        - (quote?.originalItemsTotalCents ?? group.originalItemsTotalCents),
    );
};
const minimumGapCents = computed(() => checkoutGroups.value.reduce(
  (gap, group) => gap + storeShortfallCents(group),
  0,
));
const eligibleStoreCount = computed(() => checkoutGroups.value.filter(
  (group) => storeShortfallCents(group) === 0,
).length);
const blockedStoreCount = computed(() => checkoutGroups.value.length - eligibleStoreCount.value);
const promotionDiscountCents = computed(() => activeQuote.value?.promotionDiscountCents
  ?? activeQuote.value?.stores.reduce((sum, store) => sum + (store.quote.promotionDiscountCents ?? 0), 0)
  ?? 0);
const quotedLine = (storeId: string, index: number) => quoteStores.value.get(storeId)?.lines[index];
const isLoginRequiredError = (error: unknown) => error instanceof ApiRequestError
  && ['LOGIN_REQUIRED', 'GUEST_CHECKOUT_LIMIT'].includes(error.code ?? '');

function requestFingerprint() {
  return JSON.stringify(requests.value);
}

function activeQuoteIsReusable(fingerprint: string): boolean {
  if (!activeQuote.value || activeQuoteFingerprint.value !== fingerprint) return false;
  const expiresAt = Date.parse(activeQuote.value.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now() + 1_000;
}

function activeQuoteSessionIsReusable(): boolean {
  if (!activeQuote.value) return false;
  const expiresAt = Date.parse(activeQuote.value.checkoutExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function reusablePendingCheckout(fingerprint: string): PendingCheckout | null {
  const pending = readPendingCheckout();
  if (!pending || isPendingCheckoutExpired(pending)) return null;
  if (!activeQuote.value
    || pending.checkoutId !== activeQuote.value.checkoutId
    || pending.stores.some((store) => store.quoteId !== activeQuote.value?.quoteId)) return null;
  return JSON.stringify(pending.stores.map((store) => store.request)) === fingerprint ? pending : null;
}

onLoad((options) => {
  checkoutStoreId.value = options?.storeId || '';
});
onShow(() => {
  void loadAddressAndMaybeQuote();
});

async function loadAddressAndMaybeQuote() {
  addressError.value = '';
  try {
    await addressStore.load();
  } catch (error) {
    addressError.value = error instanceof Error ? error.message : '地址加载失败';
    return;
  }
  if (checkoutGroups.value.length && selectedAddress.value) {
    await auth.ensureGuest();
    const pending = readPendingCheckout();
    if (pending) {
      const currentSubject = checkoutSubject();
      if (!pendingCheckoutMatchesSubject(pending, currentSubject)) {
        clearPendingCheckout();
        clearActiveCheckoutSession();
      } else {
        await reconcilePendingCheckout(pending);
        if (pendingCheckoutHasWork(pending)
          && pendingCheckoutMatchesRequests(pending, requests.value)
          && !isPendingCheckoutExpired(pending)) {
          adoptPendingQuote(pending);
          return;
        }
        clearPendingCheckout();
        if (isPendingCheckoutSessionExpired(pending)) clearActiveCheckoutSession();
      }
    }
    await refreshQuote(false).catch(() => undefined);
  }
}

function openAddressPicker() {
  uni.navigateTo({ url: '/pages/address-list/index' });
}

function requestForGroup(group: CartStoreGroup) {
  return {
    storeId: group.store.id,
    virtualDestinationId: selectedAddress.value?.id || 'unknown',
    virtualDestinationPoint: selectedAddress.value
      ? { lat: selectedAddress.value.lat, lng: selectedAddress.value.lng, coordSystem: 'gcj02' as const }
      : undefined,
    deliveryAddressSnapshot: selectedAddress.value
      ? {
          name: selectedAddress.value.name,
          phone: selectedAddress.value.phone,
          address: selectedAddress.value.address,
          detail: selectedAddress.value.detail,
          tag: selectedAddress.value.tag,
        }
      : undefined,
    lines: group.lines.map((line) => ({ menuItemId: line.item.id, optionIds: line.optionIds, quantity: line.quantity })),
  };
}

const requests = computed(() => checkoutGroups.value.map((group) => requestForGroup(group)));

const canSubmit = computed(() => checkoutGroups.value.length > 0
  && !!selectedAddress.value
  && eligibleStoreCount.value > 0
  && !addressError.value);

async function refreshQuote(saveForResume: boolean): Promise<PendingCheckout | null> {
  if (!requests.value.length || !selectedAddress.value) return null;
  const fingerprint = requestFingerprint();
  if (activeQuoteIsReusable(fingerprint)) {
    if (!saveForResume) return null;
    const pending = reusablePendingCheckout(fingerprint)
      ?? createPendingCheckout(activeQuote.value!, checkoutSubject());
    savePendingCheckout(pending);
    clearLegacyPendingOrders();
    return pending;
  }
  quoting.value = true;
  quoteError.value = '';
  void trackEvent('checkout.quote_started', { storeCount: requests.value.length }, auth.accessToken);
  try {
    const pendingCheckout = readPendingCheckout();
    const reusablePendingCheckoutId = pendingCheckout
      && pendingCheckoutMatchesSubject(pendingCheckout, checkoutSubject())
      && !isPendingCheckoutSessionExpired(pendingCheckout)
      ? pendingCheckout.checkoutId
      : '';
    const quote = await checkoutService.quote(requests.value, {
      checkoutId: (activeQuoteSessionIsReusable() ? activeQuote.value?.checkoutId : '')
        || reusablePendingCheckoutId
        || readActiveCheckoutId(checkoutSubject()),
    });
    activeQuote.value = quote;
    activeQuoteFingerprint.value = fingerprint;
    saveActiveCheckoutSession(quote, checkoutSubject());
    void trackEvent('checkout.quote_succeeded', {
      checkoutId: quote.checkoutId,
      storeCount: quote.stores.length,
      totalCents: quote.totalCents,
    }, auth.accessToken);
    if (!saveForResume) return null;
    const pending = createPendingCheckout(quote, checkoutSubject());
    savePendingCheckout(pending);
    clearLegacyPendingOrders();
    return pending;
  } catch (error) {
    quoteError.value = error instanceof Error ? error.message : '报价失败，请重试';
    void trackEvent('checkout.quote_failed', { storeCount: requests.value.length }, auth.accessToken);
    throw error;
  } finally {
    quoting.value = false;
  }
}

async function submit() {
  if (!canSubmit.value || submitting.value) return;
  if (!selectedAddress.value) {
    uni.showToast({ title: '请选择收货地址', icon: 'none' });
    return;
  }
  if (!eligibleStoreCount.value) {
    uni.showToast({ title: `还差 ¥${(minimumGapCents.value / 100).toFixed(2)} 起送`, icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    await auth.ensureGuest();
    let pending = readPendingCheckout();
    if (pending && !pendingCheckoutMatchesSubject(pending, checkoutSubject())) {
      clearPendingCheckout();
      clearActiveCheckoutSession();
      pending = null;
    }
    if (pending) {
      const recovered = await reconcilePendingCheckout(pending);
      if (!pendingCheckoutHasWork(pending) && recovered.length) {
        if (requests.value.length) {
          uni.showToast({
            title: `已恢复 ${recovered.length} 个订单，其余商品仍在购物车`,
            icon: 'none',
            duration: 2400,
          });
        } else {
          openCreatedOrders(recovered);
        }
        return;
      }
      const requiresFreshConfirmation = isPendingCheckoutExpired(pending)
        || isPendingCheckoutSessionExpired(pending)
        || !pendingCheckoutMatchesRequests(pending, requests.value);
      if (requiresFreshConfirmation) {
        clearPendingCheckout();
        if (isPendingCheckoutSessionExpired(pending)) clearActiveCheckoutSession();
        activeQuote.value = undefined;
        activeQuoteFingerprint.value = '';
        await refreshQuote(false);
        uni.showToast({ title: '报价已更新，请确认金额后再次提交', icon: 'none', duration: 2400 });
        return;
      }
    }
    if (!pending) {
      const fingerprint = requestFingerprint();
      if (!activeQuoteIsReusable(fingerprint) || !activeQuoteSessionIsReusable()) {
        await refreshQuote(false);
        uni.showToast({ title: '报价已更新，请确认金额后再次提交', icon: 'none', duration: 2400 });
        return;
      }
      pending = await refreshQuote(true);
    }
    if (!pending) return;
    if (!pendingCheckoutHasWork(pending)) {
      clearPendingCheckout();
      uni.showToast({ title: '各店均未达到起送门槛，请先加菜', icon: 'none' });
      return;
    }
    const result = await submitPendingCheckout(pending);
    if (!result) return;
    if (result.loginRequired) {
      void trackEvent('checkout.login_gate_shown', {
        checkoutId: pending.checkoutId,
        source: 'store_submit',
      }, auth.accessToken);
      auth.requestLogin();
      uni.showToast({ title: '游客结算次数已用完，登录后可继续，不会重复下单', icon: 'none', duration: 2600 });
      setTimeout(() => uni.switchTab({ url: '/pages/profile/index' }), 450);
      return;
    }
    if (result.needsRequoteStoreIds.length) {
      clearPendingCheckout();
      if (result.checkoutSessionInvalid) clearActiveCheckoutSession();
      activeQuote.value = undefined;
      activeQuoteFingerprint.value = '';
      await refreshQuote(false).catch(() => undefined);
      uni.showToast({
        title: '商品价格或活动已变化，请确认新金额后再次提交',
        icon: 'none',
        duration: 2600,
      });
      return;
    }
    if (result.failedStoreIds.length) {
      const title = result.created.length
        ? `已完成 ${result.created.length} 店，其余可重试`
        : '订单未提交成功，请重试';
      uni.showToast({ title, icon: 'none', duration: 2200 });
      return;
    }
    if (result.blockedStoreIds.length) {
      uni.showToast({
        title: `已完成 ${result.created.length} 店，${result.blockedStoreIds.length} 店未达起送仍在购物车`,
        icon: 'none',
        duration: 2600,
      });
      return;
    }
    if (result.created.length === 1) {
      uni.redirectTo({ url: `/pages/delivery/index?id=${result.created[0].id}` });
    } else if (result.created.length > 1) {
      uni.showToast({ title: `已生成 ${result.created.length} 个订单`, icon: 'none' });
      setTimeout(() => uni.switchTab({ url: '/pages/orders/index' }), 500);
    }
  } catch (error) {
    if (isLoginRequiredError(error)) {
      void trackEvent('checkout.login_gate_shown', {
        checkoutId: readActiveCheckoutId(checkoutSubject()),
        source: 'quote',
      }, auth.accessToken);
      auth.requestLogin();
      uni.showToast({ title: '游客结算次数已用完，登录后可继续', icon: 'none', duration: 2400 });
      setTimeout(() => uni.switchTab({ url: '/pages/profile/index' }), 450);
      return;
    }
    if (error instanceof ExpiredCheckoutError) {
      const recovered = await reconcilePendingCheckout(error.pending);
      clearPendingCheckout();
      if (isPendingCheckoutSessionExpired(error.pending)) clearActiveCheckoutSession();
      activeQuote.value = undefined;
      activeQuoteFingerprint.value = '';
      if (recovered.length && !requests.value.length) {
        openCreatedOrders(recovered);
        return;
      }
      uni.showToast({ title: '报价已过期，正在重新计算', icon: 'none' });
      await refreshQuote(false).catch(() => undefined);
      return;
    }
    const insufficient = error instanceof ApiRequestError && error.code === 'INSUFFICIENT_BALANCE';
    uni.showToast({ title: insufficient ? '虚拟余额不足' : (quoteError.value || '订单创建失败，请重试'), icon: 'none' });
  } finally { submitting.value = false; }
}

function openCreatedOrders(created: NonNullable<Awaited<ReturnType<typeof submitPendingCheckout>>>['created']) {
  if (created.length === 1) {
    uni.redirectTo({ url: `/pages/delivery/index?id=${created[0].id}` });
  } else if (created.length > 1) {
    uni.showToast({ title: `已恢复 ${created.length} 个订单`, icon: 'none' });
    setTimeout(() => uni.switchTab({ url: '/pages/orders/index' }), 500);
  }
}

function adoptPendingQuote(pending: PendingCheckout) {
  const stores = pending.stores.filter((store) => store.status !== 'succeeded');
  const sum = (field: keyof PendingCheckout['stores'][number]['quote']) => stores.reduce(
    (total, store) => total + Number(store.quote[field] ?? 0),
    0,
  );
  activeQuote.value = {
    checkoutId: pending.checkoutId,
    quoteId: stores[0]?.quoteId ?? pending.stores[0]?.quoteId ?? '',
    quotedAt: pending.createdAt,
    expiresAt: pending.expiresAt,
    checkoutExpiresAt: pending.checkoutExpiresAt,
    stores,
    originalItemsTotalCents: sum('originalItemsTotalCents'),
    itemsTotalCents: sum('itemsTotalCents'),
    deliveryFeeCents: sum('deliveryFeeCents'),
    packingFeeCents: sum('packingFeeCents'),
    minimumOrderShortfallCents: sum('minimumOrderShortfallCents'),
    flashDiscountCents: sum('flashDiscountCents'),
    storeDiscountCents: sum('storeDiscountCents'),
    promotionDiscountCents: sum('promotionDiscountCents'),
    totalCents: sum('totalCents'),
  };
  activeQuoteFingerprint.value = requestFingerprint();
}
</script>

<template>
  <view class="page">
    <view class="virtual-notice">
      {{ auth.accountId ? '订单仅扣应用内虚拟余额，不产生真实支付或配送。' : '游客下单不扣余额，也不产生真实支付或配送。' }}
    </view>

    <!-- 收货地址卡片 -->
    <view class="address-card" @tap="openAddressPicker">
      <view v-if="selectedAddress" class="address-info">
        <view class="address-top">
          <text class="address-name">{{ selectedAddress.name }}</text>
          <text class="address-phone">{{ selectedAddress.phone }}</text>
          <text v-if="selectedAddress.tag" class="address-tag">{{ selectedAddress.tag }}</text>
        </view>
        <text class="address-text">{{ selectedAddress.address }}</text>
        <text v-if="selectedAddress.detail" class="address-detail">{{ selectedAddress.detail }}</text>
        <text v-if="isDefaultDeliveryAddress(selectedAddress)" class="default-address-hint">新用户已安排默认收货点，点此可换成自己的</text>
      </view>
      <view v-else class="address-empty">
        <text class="empty-text">请选择收货地址</text>
      </view>
      <text class="address-arrow">›</text>
    </view>
    <view v-if="addressError" class="state-card error-card">
      <text>{{ addressError }}</text>
      <button @tap="loadAddressAndMaybeQuote">重试</button>
    </view>

    <!-- 订单商品 -->
    <view v-for="group in checkoutGroups" :key="group.store.id" class="card order-card">
      <text class="heading">{{ group.store.name }}</text>
      <view v-for="(line, lineIndex) in group.lines" :key="line.key" class="line">
        <view class="line-left">
          <text class="line-name">{{ quotedLine(group.store.id, lineIndex)?.name ?? line.item.name }} × {{ quotedLine(group.store.id, lineIndex)?.quantity ?? line.quantity }}</text>
          <text class="line-opts">{{ quotedLine(group.store.id, lineIndex)?.optionNames.join('、') || line.optionNames.join('、') || '默认规格' }}</text>
        </view>
        <text class="line-price">¥{{ ((quotedLine(group.store.id, lineIndex)?.totalCents ?? line.totalCents) / 100).toFixed(2) }}</text>
      </view>
      <view class="line fee">
        <text>餐品原价</text>
        <text>¥{{ ((quoteStores.get(group.store.id)?.originalItemsTotalCents ?? group.originalItemsTotalCents) / 100).toFixed(2) }}</text>
      </view>
      <view v-if="(quoteStores.get(group.store.id)?.flashDiscountCents ?? 0) > 0" class="line discount">
        <text>单品活动优惠</text>
        <text>-¥{{ ((quoteStores.get(group.store.id)?.flashDiscountCents ?? 0) / 100).toFixed(2) }}</text>
      </view>
      <view v-if="(quoteStores.get(group.store.id)?.storeDiscountCents ?? 0) > 0" class="line discount">
        <text>店铺满减优惠</text>
        <text>-¥{{ ((quoteStores.get(group.store.id)?.storeDiscountCents ?? 0) / 100).toFixed(2) }}</text>
      </view>
      <view
        v-if="(quoteStores.get(group.store.id)?.promotionDiscountCents ?? 0) > 0
          && quoteStores.get(group.store.id)?.flashDiscountCents == null
          && quoteStores.get(group.store.id)?.storeDiscountCents == null"
        class="line discount"
      >
        <text>活动优惠</text>
        <text>-¥{{ ((quoteStores.get(group.store.id)?.promotionDiscountCents ?? 0) / 100).toFixed(2) }}</text>
      </view>
      <view v-if="quoteStores.get(group.store.id)" class="line fee">
        <text>优惠后餐品</text>
        <text>¥{{ ((quoteStores.get(group.store.id)?.itemsTotalCents ?? group.itemsTotalCents) / 100).toFixed(2) }}</text>
      </view>
      <view class="line fee">
        <text>配送费</text>
        <text>¥{{ ((quoteStores.get(group.store.id)?.deliveryFeeCents ?? group.store.deliveryFeeCents) / 100).toFixed(2) }}</text>
      </view>
      <view class="line fee">
        <text>包装费</text>
        <text>¥{{ ((quoteStores.get(group.store.id)?.packingFeeCents ?? group.store.packingFeeCents) / 100).toFixed(2) }}</text>
      </view>
      <view class="line total">
        <text>本店小计</text>
        <text class="total-price">¥{{ ((quoteStores.get(group.store.id)?.totalCents ?? group.totalCents) / 100).toFixed(2) }}</text>
      </view>
      <view v-if="storeShortfallCents(group) > 0" class="store-shortfall">
        本店还差 ¥{{ (storeShortfallCents(group) / 100).toFixed(2) }} 起送，将保留在购物车
      </view>
    </view>

    <view v-if="checkoutGroups.length > 1" class="card merge-card">
      <view class="line total merge-total">
        <text>多店合计</text>
        <text class="total-price">¥{{ (checkoutTotalCents / 100).toFixed(2) }}</text>
      </view>
      <text v-if="promotionDiscountCents" class="discount-summary">
        已按服务端活动价优惠 ¥{{ (promotionDiscountCents / 100).toFixed(2) }}
      </text>
    </view>

    <view v-if="blockedStoreCount > 0" class="state-card warning-card">
      {{ blockedStoreCount }} 家未达到起送门槛；其余 {{ eligibleStoreCount }} 家仍可单独提交
    </view>
    <view v-if="quoteError" class="state-card error-card">
      <text>{{ quoteError }}</text>
      <button @tap="refreshQuote(false)">重新报价</button>
    </view>

    <!-- 提交按钮 -->
    <button class="submit-btn" :loading="submitting || quoting" :disabled="!canSubmit || quoting" @tap="submit">
      {{ !selectedAddress ? '请先选择地址' : !eligibleStoreCount ? '未达到起送门槛' : quoting ? '正在确认活动与价格' : '提交订单' }}
    </button>
  </view>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx 28rpx calc(180rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: #f6f6f6;
}

.virtual-notice {
  padding: 16rpx 20rpx;
  margin-bottom: 20rpx;
  border-radius: 16rpx;
  color: #b8860b;
  background: #fff8e6;
  font-size: 22rpx;
  font-weight: 600;
  text-align: center;
}
.state-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  margin-bottom: 20rpx;
  padding: 20rpx 22rpx;
  border: 2rpx solid #171717;
  border-radius: 18rpx 8rpx 18rpx 8rpx;
  color: #171717;
  background: #fff;
  font-size: 23rpx;
  font-weight: 700;
}
.state-card button {
  flex: 0 0 auto;
  margin: 0;
  padding: 0 20rpx;
  border-radius: 20rpx;
  color: #171717;
  background: #ffd400;
  font-size: 22rpx;
  line-height: 58rpx;
}
.state-card button::after { border: 0; }
.error-card { border-color: #f04426; background: #fff2ee; }
.warning-card { border-color: #ffd400; background: #fff9d9; }

/* ── 地址卡片 ── */
.address-card {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 28rpx 24rpx;
  margin-bottom: 24rpx;
  border: 2rpx solid #ffd400;
  border-radius: 24rpx;
  background: #fff;
}
.address-info { flex: 1; min-width: 0; }
.address-top { display: flex; align-items: center; gap: 12rpx; flex-wrap: wrap; }
.address-name { font-size: 32rpx; font-weight: 800; color: #171717; }
.address-phone { font-size: 26rpx; color: #666; }
.address-tag {
  font-size: 20rpx;
  font-weight: 600;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
  color: #f04426;
  background: #fff0ec;
}
.address-text {
  display: block;
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #555;
  line-height: 1.4;
}
.address-detail { display: block; margin-top: 4rpx; font-size: 24rpx; color: #999; }
.default-address-hint { display: block; margin-top: 10rpx; color: #b8860b; font-size: 22rpx; font-weight: 600; }
.address-empty { flex: 1; }
.empty-text { font-size: 28rpx; color: #999; }
.address-arrow { font-size: 40rpx; color: #ccc; font-weight: 300; }

/* ── 订单卡片 ── */
.card {
  margin-bottom: 24rpx;
  padding: 28rpx 24rpx;
  border: 1rpx solid #ececec;
  border-radius: 24rpx;
  background: #fff;
}
.heading { display: block; font-size: 30rpx; font-weight: 800; margin-bottom: 20rpx; color: #171717; }
.line {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  padding: 14rpx 0;
  border-bottom: 1rpx solid #f0f0ee;
}
.line-left { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.line-name { font-size: 26rpx; font-weight: 600; color: #333; }
.line-opts { margin-top: 4rpx; font-size: 22rpx; color: #999; }
.line-price { font-size: 26rpx; font-weight: 800; color: #f04426; white-space: nowrap; }
.fee { border-bottom: 0; padding: 8rpx 0; }
.fee text { font-size: 24rpx; color: #999; }
.discount { border-bottom: 0; padding: 8rpx 0; }
.discount text { color: #259b58; font-size: 24rpx; font-weight: 700; }
.total { border-bottom: 0; padding-top: 16rpx; border-top: 1rpx solid #f0f0ee; }
.total text { font-size: 28rpx; font-weight: 800; color: #171717; }
.total-price { color: #f04426; font-size: 32rpx; }
.discount-summary { display: block; margin-top: 12rpx; color: #259b58; font-size: 23rpx; text-align: right; }
.store-shortfall { margin-top: 14rpx; padding: 14rpx 16rpx; border-radius: 14rpx 6rpx 14rpx 6rpx; color: #8a3d2d; background: #fff0ec; font-size: 22rpx; font-weight: 800; }

/* ── 提交按钮 ── */
.submit-btn {
  position: fixed;
  left: 28rpx;
  right: 28rpx;
  bottom: calc(24rpx + env(safe-area-inset-bottom));
  height: 96rpx;
  margin: 0;
  border-radius: 24rpx;
  color: #171717;
  background: #ffd400;
  font-size: 32rpx;
  font-weight: 900;
  line-height: 96rpx;
  box-shadow: 0 12rpx 32rpx rgba(0, 0, 0, .1);
}
.submit-btn[disabled] { color: #777; background: #ddd; }
.submit-btn::after { border: 0; }
</style>
