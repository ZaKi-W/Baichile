<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { catalogService } from '../../services/catalog';
import { useAddressStore } from '../../stores/address';
import { useCartStore } from '../../stores/cart';
import { useOrderStore } from '../../stores/orders';
import { DELIVERY_START_MS, getOrderStepIndex, ORDER_STEPS } from '../../utils/order-status';
import { findDeliveryIncident, getDeliveryIncidentPhase } from '@baichile/domain';
import { reorder } from '../../utils/reorder';
import { shareService } from '../../services/shares';
import { shareLandingUrl } from '../../utils/share-navigation';
import {
  createOrderEggPresentation,
  hasSeenOrderEgg,
  markOrderEggSeen,
} from '../../utils/order-easter-egg';

const orders = useOrderStore();
const addressStore = useAddressStore();
const cart = useCartStore();

const orderId = ref('');
const preparingShare = ref(false);
const storeName = ref('商家');
const storeCoverUrl = ref('');
const storeDistanceKm = ref(3);
const storeDeliveryMinutes = ref(30);
const sheetExpanded = ref(false);
const sheetDragStartY = ref<number | null>(null);
const sheetDragOffset = ref(0);
const suppressNextSheetTap = ref(false);
let mapCtx: UniApp.MapContext | null = null;
const mapReady = ref(false);
const now = ref(Date.now());
const eggRevealVisible = ref(false);
const eggRevealImageFailed = ref(false);
const forceEggRevealRequested = ref(false);
let cameraFramed = false;

const systemInfo = uni.getSystemInfoSync();
const menuButtonRect = uni.getMenuButtonBoundingClientRect();
const safeTopStyle = { paddingTop: `${Math.max((systemInfo.statusBarHeight ?? 20) + 8, menuButtonRect.bottom + 8)}px` };
const eggRevealBackdropStyle = {
  paddingTop: `${Math.max((systemInfo.statusBarHeight ?? 20) + 16, menuButtonRect.bottom + 16)}px`,
  paddingBottom: `${Math.max(systemInfo.screenHeight - (systemInfo.safeArea?.bottom ?? systemInfo.screenHeight), 16) + 16}px`,
};

const order = computed(() => orders.find(orderId.value));
const displayStoreName = computed(() => order.value?.storeName || storeName.value);
const sheetStyle = computed(() => ({
  transform: `translateY(${sheetDragOffset.value}px)`,
}));

/* ── delivery address ── */
const deliveryAddress = computed(() => {
  if (!order.value) return '';
  if (order.value.deliveryAddress) {
    const { address, detail } = order.value.deliveryAddress;
    return `${address}${detail ? ' ' + detail : ''}`;
  }
  const addr = addressStore.addresses.find((a) => a.id === order.value!.virtualDestinationId);
  return addr ? `${addr.address}${addr.detail ? ' ' + addr.detail : ''}` : '配送地址';
});
const deliveryContactName = computed(() => {
  if (order.value?.deliveryAddress?.name) return order.value.deliveryAddress.name;
  return addressStore.addresses.find((a) => a.id === order.value?.virtualDestinationId)?.name || '';
});
const deliveryContactPhone = computed(() => {
  if (order.value?.deliveryAddress?.phone) return order.value.deliveryAddress.phone;
  return addressStore.addresses.find((a) => a.id === order.value?.virtualDestinationId)?.phone || '';
});
const paymentMethodText = computed(() => '虚拟余额支付');

/* ── map center: destination (收货地址) ── */
const mapCenter = computed(() => {
  if (!order.value) return { lat: 31.2303, lng: 121.4737 };
  return {
    lat: order.value.route.destination.lat,
    lng: order.value.route.destination.lng,
  };
});

/* ── rider position: random around destination, based on store distanceKm ── */
const riderPosition = computed(() => {
  if (!order.value) return null;
  const dest = order.value.route.destination;
  const distKm = storeDistanceKm.value;

  const hash = seedHash(order.value.seed);
  const angle = (hash % 360) * (Math.PI / 180);
  // Place rider at 30%–80% of store distance from destination
  const dist = distKm * (0.3 + ((hash % 50) / 100));

  const dLat = (dist * Math.cos(angle)) / 111;
  const dLng = (dist * Math.sin(angle)) / (111 * Math.cos(dest.lat * Math.PI / 180));

  return {
    lat: dest.lat + dLat,
    lng: dest.lng + dLng,
  };
});

/* ── markers ── */
const markers = computed(() => {
  if (!order.value || !riderPosition.value) return [];
  const route = order.value.route;
  return [
    {
      id: 1,
      latitude: route.origin.lat,
      longitude: route.origin.lng,
      iconPath: '/static/marker-store.png',
      width: 32,
      height: 38,
      anchor: { x: 0.5, y: 1 },
      callout: {
        content: displayStoreName.value,
        display: 'ALWAYS' as const,
        fontSize: 13,
        borderRadius: 6,
        padding: 6,
        bgColor: '#ffffff',
        color: '#171717',
        borderWidth: 0,
      },
    },
    {
      id: 2,
      latitude: route.destination.lat,
      longitude: route.destination.lng,
      iconPath: '/static/marker-dest.png',
      width: 32,
      height: 38,
      anchor: { x: 0.5, y: 1 },
      callout: {
        content: deliveryAddress.value.length > 14
          ? deliveryAddress.value.slice(0, 14) + '…'
          : deliveryAddress.value,
        display: 'ALWAYS' as const,
        fontSize: 13,
        borderRadius: 6,
        padding: 6,
        bgColor: '#ffffff',
        color: '#171717',
        borderWidth: 0,
      },
    },
    {
      id: 3,
      latitude: riderPosition.value.lat,
      longitude: riderPosition.value.lng,
      iconPath: '/static/marker-rider.png',
      width: 40,
      height: 40,
      anchor: { x: 0.5, y: 0.5 },
    },
  ];
});

/* ── polyline ── */
const polylineConfig = computed(() => {
  if (!order.value) return [];
  return [
    {
      points: order.value.route.polyline.map((p) => ({
        latitude: p.lat,
        longitude: p.lng,
      })),
      color: '#FF5A38',
      width: 6,
      arrowLine: true,
      borderColor: '#ffffff',
      borderWidth: 2,
      dottedLine: false,
    },
  ];
});

/* ── timeline with step progression ── */
const STEPS = ORDER_STEPS;
const FINAL_STEP = ORDER_STEPS.length - 1;

const currentStepIndex = ref(0);
let stepTimer: ReturnType<typeof setInterval> | undefined;
let failureRefreshRequested = false;
let completionRefreshRequested = false;

const incidentPhase = computed(() => order.value?.incident
  ? getDeliveryIncidentPhase(order.value.incident, now.value)
  : 'pending');
const incidentDefinition = computed(() => order.value?.incident
  ? findDeliveryIncident(order.value.incident.key)
  : undefined);
const hasIncident = computed(() => incidentPhase.value === 'incident');
const hasFailed = computed(() => incidentPhase.value === 'failed');
const eggPresentation = computed(() => order.value
  ? createOrderEggPresentation(order.value, now.value)
  : undefined);
const canShareOrder = computed(() => {
  if (!order.value) return false;
  if (hasIncident.value || hasFailed.value) return true;
  const deliveredAt = new Date(order.value.startedAt).getTime() + DELIVERY_START_MS + order.value.durationMs;
  return now.value >= deliveredAt;
});
const timelineSteps = computed(() => {
  if (!hasIncident.value && !hasFailed.value) return STEPS;
  return STEPS.map((step, index) => index === FINAL_STEP
    ? { ...step, label: hasFailed.value ? '配送失败' : '突发事件' }
    : step);
});

function startStepTimer() {
  clearInterval(stepTimer);
  if (!order.value) return;
  const startedAt = new Date(order.value.startedAt).getTime();
  // Immediately set step based on elapsed time (supports re-entering)
  updateDeliveryState(startedAt);
  // If already at final step, no need for interval
  if (hasFailed.value || (!order.value.incident && currentStepIndex.value >= FINAL_STEP)) return;
  // Otherwise poll every second until we reach final step
  stepTimer = setInterval(() => {
    now.value = Date.now();
    updateDeliveryState(startedAt);
    if (hasFailed.value || (!order.value?.incident && currentStepIndex.value >= FINAL_STEP)) {
      clearInterval(stepTimer);
    }
  }, 1000);
}

function updateDeliveryState(startedAt: number) {
  const currentOrder = order.value;
  if (!currentOrder) return;
  currentStepIndex.value = hasIncident.value || hasFailed.value
    ? FINAL_STEP
    : getOrderStepIndex(startedAt, currentOrder.durationMs, now.value);
  if (!currentOrder.incident && currentStepIndex.value >= FINAL_STEP && !completionRefreshRequested) {
    completionRefreshRequested = true;
    void orders.fetchDetail(currentOrder.id, { force: true }).catch(() => undefined);
  }
  if (hasFailed.value && !failureRefreshRequested) {
    failureRefreshRequested = true;
    void orders.load();
  }
}

watch(
  () => order.value && eggPresentation.value
    ? `${order.value.id}:${eggPresentation.value.id}`
    : '',
  (revealId) => {
    if (!revealId || !order.value || !eggPresentation.value) return;
    eggRevealImageFailed.value = false;
    if (forceEggRevealRequested.value) {
      forceEggRevealRequested.value = false;
      eggRevealVisible.value = true;
      return;
    }
    if (!hasSeenOrderEgg(order.value.id, eggPresentation.value.id)) eggRevealVisible.value = true;
  },
  { immediate: true },
);

const statusText = computed(() => {
  if (hasFailed.value) return '配送失败';
  if (hasIncident.value) return incidentDefinition.value?.activeText || '配送出现突发情况';
  return STEPS[currentStepIndex.value]?.statusText || '配送中';
});

/* ── rider name ── */
const SURNAMES = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴'];
const riderName = computed(() => {
  if (!order.value) return '骑手';
  const hash = seedHash(order.value.seed);
  return `${SURNAMES[hash % SURNAMES.length]}师傅`;
});

/* ── estimated delivery time ── */
const etaText = computed(() => {
  if (hasFailed.value) return incidentDefinition.value?.failedText || '本单未能送达';
  if (hasIncident.value) return '正在确认外卖的下落';
  if (currentStepIndex.value === FINAL_STEP) return '订单已送达';
  if (!order.value) return `预计 ${storeDeliveryMinutes.value} 分钟送达`;
  const startedAt = new Date(order.value.startedAt).getTime();
  const remainingSeconds = Math.max(1, Math.ceil((startedAt + DELIVERY_START_MS + order.value.durationMs - now.value) / 1000));
  return remainingSeconds >= 60
    ? `预计 ${Math.ceil(remainingSeconds / 60)} 分钟送达`
    : `预计 ${remainingSeconds} 秒送达`;
});
const deliveryTimeText = computed(() => {
  if (!order.value) return '';
  if (hasFailed.value) return '配送失败，已原路退款';
  const deliveredAt = new Date(new Date(order.value.startedAt).getTime() + DELIVERY_START_MS + order.value.durationMs);
  return currentStepIndex.value === FINAL_STEP
    ? `${formatDateTime(deliveredAt.toISOString())} 已送达`
    : `预计 ${formatClock(deliveredAt)} 送达`;
});

/* ── distance display ── */
const distanceText = computed(() => {
  if (hasFailed.value) return order.value?.refundStatus === 'refunded' ? '已退款' : '退款处理中';
  if (hasIncident.value) return '';
  return `距离收货地址约 ${storeDistanceKm.value.toFixed(1)} 公里`;
});

/* ── deterministic hash from seed string ── */
function seedHash(seed: string): number {
  return Math.abs(seed.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0));
}

function formatMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatClock(date: Date): string {
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* ── resolve store info ── */
async function resolveStoreInfo() {
  if (!order.value) return;
  try {
    let detail;
    if (cart.store && cart.store.id === order.value.storeId) {
      detail = cart.store;
    } else {
      detail = await catalogService.store(order.value.storeId);
    }
    storeName.value = detail.name;
    storeCoverUrl.value = detail.coverUrl || '';
    storeDistanceKm.value = detail.distanceKm || 3;
    storeDeliveryMinutes.value = detail.virtualDeliveryMinutes || 30;
  } catch {
    storeName.value = '商家';
    storeCoverUrl.value = '';
  }
}

/* ── map ready & camera framing ── */
function onMapUpdated() {
  if (!mapCtx) {
    mapCtx = uni.createMapContext('deliveryMap', getCurrentInstance());
  }
  mapReady.value = true;

  if (!cameraFramed && order.value) {
    cameraFramed = true;
    nextTick(() => {
      mapCtx?.includePoints({
        points: order.value!.route.polyline.map((p) => ({
          latitude: p.lat,
          longitude: p.lng,
        })),
        padding: [100, 60, 300, 60],
      });
    });
  }
}

function touchY(event: TouchEvent): number | undefined {
  return event.touches[0]?.clientY ?? event.changedTouches[0]?.clientY;
}

function onSheetTouchStart(event: TouchEvent) {
  sheetDragStartY.value = touchY(event) ?? null;
  sheetDragOffset.value = 0;
}

function onSheetTouchMove(event: TouchEvent) {
  if (sheetDragStartY.value === null) return;
  const currentY = touchY(event);
  if (currentY === undefined) return;
  const delta = currentY - sheetDragStartY.value;
  sheetDragOffset.value = Math.max(-80, Math.min(80, delta));
}

function onSheetTouchEnd() {
  const dragged = Math.abs(sheetDragOffset.value) > 6;
  if (sheetDragOffset.value < -28) sheetExpanded.value = true;
  if (sheetDragOffset.value > 28) sheetExpanded.value = false;
  if (dragged) {
    suppressNextSheetTap.value = true;
    setTimeout(() => { suppressNextSheetTap.value = false; }, 0);
  }
  sheetDragStartY.value = null;
  sheetDragOffset.value = 0;
}

function toggleSheet() {
  if (sheetDragStartY.value !== null || suppressNextSheetTap.value) return;
  sheetExpanded.value = !sheetExpanded.value;
}

/* ── lifecycle ── */
onLoad(async (options) => {
  forceEggRevealRequested.value = options?.revealEgg === '1';
  orderId.value = options?.id || '';
  void addressStore.load();
  if (orderId.value) {
    try {
      await orders.fetchDetail(orderId.value, { force: forceEggRevealRequested.value });
    } catch (error) {
      uni.showToast({ title: error instanceof Error ? error.message : '订单加载失败', icon: 'none' });
    }
  }
  startStepTimer();
  await resolveStoreInfo();
});

onBeforeUnmount(() => clearInterval(stepTimer));

/* ── navigation ── */
function goBack() {
  uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/home/index' }) });
}

function goToStore() {
  if (!order.value) return;
  uni.redirectTo({ url: `/pages/store/index?id=${order.value.storeId}` });
}

async function reorderCurrent() {
  if (!order.value) return;
  try { await reorder(order.value); uni.showToast({ title: '原订单已加入购物车', icon: 'success' }); }
  catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '再来一单失败', icon: 'none' }); }
}

async function prepareTimelineShare() {
  if (!order.value || preparingShare.value) return;
  preparingShare.value = true;
  try { const card = await shareService.create({ kind: 'order', orderId: order.value.id, showIdentity: true }); uni.navigateTo({ url: shareLandingUrl(card) }); }
  catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '分享准备失败', icon: 'none' }); }
  finally { preparingShare.value = false; }
}

function openEggReveal() {
  if (!eggPresentation.value) return;
  eggRevealImageFailed.value = false;
  eggRevealVisible.value = true;
}

function closeEggReveal() {
  if (order.value && eggPresentation.value) markOrderEggSeen(order.value.id, eggPresentation.value.id);
  eggRevealVisible.value = false;
}

async function shareEgg() {
  closeEggReveal();
  await prepareTimelineShare();
}

function handleEggRevealImageError() {
  eggRevealImageFailed.value = true;
}
</script>

<template>
  <view class="delivery-page" v-if="order">
    <!-- ── 全屏地图 ── -->
    <map
      id="deliveryMap"
      class="delivery-map"
      :latitude="mapCenter.lat"
      :longitude="mapCenter.lng"
      :scale="14"
      :markers="markers"
      :polyline="polylineConfig"
      :show-location="false"
      :enable-zoom="true"
      :enable-scroll="true"
      :enable-rotate="false"
      :enable-overlooking="false"
      @updated="onMapUpdated"
    />

    <!-- ── 浮动返回按钮 ── -->
    <view class="nav-floating" :style="safeTopStyle">
      <view class="back-btn" @tap="goBack">
        <text class="back-icon">‹</text>
      </view>
    </view>

    <!-- ── 底部信息面板 ── -->
    <view
      class="bottom-sheet"
      :class="{ 'bottom-sheet-expanded': sheetExpanded, 'bottom-sheet-dragging': sheetDragOffset !== 0 }"
      :style="sheetStyle"
    >
      <view
        class="sheet-drag-zone"
        @tap="toggleSheet"
        @touchstart="onSheetTouchStart"
        @touchmove.stop.prevent="onSheetTouchMove"
        @touchend="onSheetTouchEnd"
        @touchcancel="onSheetTouchEnd"
      >
        <view class="sheet-handle" />
      </view>

      <!-- 状态头部 -->
      <view class="sheet-header">
        <text class="status-label">{{ statusText }}</text>
        <text class="eta-text">{{ etaText }}</text>
        <text class="distance-text">{{ distanceText }}</text>
      </view>

      <!-- 时间轴 -->
      <view class="timeline">
        <view
          v-for="(step, idx) in timelineSteps"
          :key="step.key"
          class="step"
        >
          <view class="step-node">
            <view v-if="idx > 0" class="step-line" :class="{ active: idx <= currentStepIndex }" />
            <view class="step-dot" :class="{
              done: idx < currentStepIndex,
              current: idx === currentStepIndex,
              pending: idx > currentStepIndex,
            }" />
          </view>
          <text class="step-label" :class="{ active: idx <= currentStepIndex }">{{ step.label }}</text>
        </view>
      </view>

      <view
        v-if="eggPresentation"
        class="egg-card"
        :class="{ 'egg-card-active': eggPresentation.state === 'active' }"
        :style="{ borderColor: eggPresentation.themeColor }"
        @tap="openEggReveal"
      >
        <view class="egg-card-accent" :style="{ background: eggPresentation.themeColor }" />
        <view class="egg-card-copy">
          <view class="egg-card-head">
            <text class="egg-card-badge">{{ eggPresentation.eyebrow }}</text>
            <text class="egg-card-meta">{{ eggPresentation.meta }}</text>
          </view>
          <text class="egg-card-title">{{ eggPresentation.title }}</text>
          <text class="egg-card-description">{{ eggPresentation.description }}</text>
          <text class="egg-card-link">点击查看彩蛋详情</text>
        </view>
      </view>

      <view class="order-primary-actions">
        <button class="order-primary-button reorder-button" @tap="reorderCurrent">{{ hasFailed ? '重新点一单' : '再来一单' }}</button>
        <button
          v-if="canShareOrder"
          class="order-primary-button share-button"
          :loading="preparingShare"
          @tap="prepareTimelineShare"
        >分享订单</button>
      </view>

      <!-- 分隔线 -->
      <view class="divider" />

      <!-- 骑手信息 -->
      <view class="rider-row">
        <view class="rider-avatar">
          <image class="rider-image" src="/static/marker-rider.png" mode="aspectFit" />
        </view>
        <view class="rider-info">
          <text class="rider-name">{{ riderName }}</text>
          <text class="rider-tag">配送骑手</text>
        </view>
        <view class="contact-btn">
          <text class="contact-text">联系骑手</text>
        </view>
      </view>

      <!-- 分隔线 -->
      <view class="divider" />

      <!-- 订单详情 -->
      <view class="order-detail">
        <view class="store-title-row" hover-class="store-title-row-active" @tap="goToStore">
          <image v-if="storeCoverUrl" class="store-thumb" :src="storeCoverUrl" mode="aspectFill" />
          <view v-else class="store-thumb thumb-fallback">
            <text>{{ displayStoreName.slice(0, 1) }}</text>
          </view>
          <text class="store-title">{{ displayStoreName }} ›</text>
        </view>
        <view v-for="line in order.lines" :key="line.menuItemId + line.optionNames.join(',')" class="dish-line">
          <image v-if="line.imageUrl" class="dish-thumb" :src="line.imageUrl" mode="aspectFill" />
          <view v-else class="dish-thumb dish-thumb-fallback">
            <text>{{ line.name.slice(0, 1) }}</text>
          </view>
          <view class="dish-main">
            <text class="dish-name">{{ line.name }}</text>
            <text v-if="line.optionNames.length" class="dish-options">{{ line.optionNames.join('、') }}</text>
            <text v-else class="dish-options">默认规格</text>
          </view>
          <view class="dish-qty">
            <text>×{{ line.quantity }}</text>
          </view>
          <view class="dish-price">
            <text class="paid-price">{{ formatMoney(line.totalCents) }}</text>
            <text class="unit-price">{{ formatMoney(line.unitPriceCents) }}/份</text>
          </view>
        </view>
        <view class="fee-line"><text>配送费</text><text>{{ formatMoney(order.deliveryFeeCents) }}</text></view>
        <view class="total-line"><text>实付</text><text>{{ formatMoney(order.totalCents) }}</text></view>
      </view>

      <!-- 分隔线 -->
      <view class="divider" />

      <!-- 配送与订单信息 -->
      <view class="order-info">
        <view class="info-row">
          <text class="info-label">收货人</text>
          <text class="info-value">{{ deliveryContactName || '收货人' }} {{ deliveryContactPhone }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">收货地址</text>
          <text class="info-value">{{ deliveryAddress }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">配送时间</text>
          <text class="info-value">{{ deliveryTimeText }}</text>
        </view>
      </view>

      <view class="order-info compact-info">
        <view class="info-row">
          <text class="info-label">下单时间</text>
          <text class="info-value">{{ formatDateTime(order.createdAt || order.startedAt) }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">支付方式</text>
          <text class="info-value">{{ paymentMethodText }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">订单号</text>
          <view class="order-number-wrap">
            <text class="info-value mono-value order-number">{{ order.id }}</text>
            <text class="copy-text">复制</text>
          </view>
        </view>
      </view>

      <!-- 分隔线 -->
      <view class="divider" />

      <!-- 路线信息 -->
      <view class="route-info">
        <view class="route-point">
          <view class="route-dot origin" />
          <view class="route-text">
            <text class="route-label">商家</text>
            <text class="route-value">{{ displayStoreName }}</text>
          </view>
        </view>
        <view class="route-connector" />
        <view class="route-point">
          <view class="route-dot dest" />
          <view class="route-text">
            <text class="route-label">送达</text>
            <text class="route-value">{{ deliveryAddress }}</text>
          </view>
        </view>
      </view>
    </view>

    <view
      v-if="eggRevealVisible && eggPresentation"
      class="egg-reveal-backdrop"
      :style="eggRevealBackdropStyle"
      @tap.stop
    >
      <view
        class="egg-reveal-dialog"
        :style="{ borderColor: eggPresentation.themeColor }"
        role="dialog"
        aria-label="订单彩蛋揭晓"
      >
        <view class="egg-reveal-rail" :style="{ background: eggPresentation.themeColor }" />
        <button class="egg-reveal-close" aria-label="关闭彩蛋揭晓" @tap="closeEggReveal">×</button>
        <view class="egg-reveal-scroll">
          <view class="egg-reveal-visual" :style="{ background: eggPresentation.themeColor }">
            <image
              v-if="!eggRevealImageFailed"
              class="egg-reveal-image"
              :src="eggPresentation.imageUrl"
              mode="aspectFill"
              @error="handleEggRevealImageError"
            />
            <view v-else class="egg-reveal-image-fallback">
              <text>彩蛋图鉴</text>
              <text>{{ eggPresentation.kind === 'collection' ? '收藏款' : '配送款' }}</text>
            </view>
          </view>
          <view class="egg-reveal-copy">
            <view class="egg-reveal-heading">
              <text class="egg-reveal-eyebrow">{{ eggPresentation.eyebrow }}</text>
              <text class="egg-reveal-meta">{{ eggPresentation.meta }}</text>
            </view>
            <text class="egg-reveal-title">{{ eggPresentation.title }}</text>
            <text class="egg-reveal-description">{{ eggPresentation.description }}</text>
            <view class="egg-reveal-footer">
              <view class="egg-reveal-stamp" :style="{ color: eggPresentation.themeColor, borderColor: eggPresentation.themeColor }">
                {{ eggPresentation.kind === 'collection' ? '收藏有效' : '突发认证' }}
              </view>
              <view class="egg-reveal-actions">
                <button class="egg-reveal-button accept" @tap="closeEggReveal">收下彩蛋</button>
                <button class="egg-reveal-button share" :loading="preparingShare" @tap="shareEgg">分享这枚彩蛋</button>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>

  <!-- 未找到订单 -->
  <view v-else class="empty-state">
    <text class="empty-text">未找到该订单</text>
  </view>
</template>

<style scoped>
.delivery-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

/* ── 地图 ── */
.delivery-map {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

/* ── 浮动导航 ── */
.nav-floating {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 20;
  padding-left: 24rpx;
  padding-top: 8rpx;
}
.back-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.1);
}
.back-icon {
  font-size: 48rpx;
  font-weight: 300;
  color: #171717;
  line-height: 1;
}

/* ── 底部面板 ── */
.bottom-sheet {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
  background: #f0f0ee;
  border-radius: 32rpx 32rpx 0 0;
  padding: 0 26rpx calc(28rpx + env(safe-area-inset-bottom));
  box-shadow: 0 -8rpx 40rpx rgba(0, 0, 0, 0.08);
  max-height: 48vh;
  overflow-y: auto;
  transition: max-height 180ms ease, transform 120ms ease;
}
.bottom-sheet-expanded {
  max-height: 78vh;
}
.bottom-sheet-dragging {
  transition: none;
}
.order-primary-actions {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 18rpx;
  margin: 28rpx 0 8rpx;
}
.order-primary-button {
  min-width: 0;
  height: 82rpx;
  flex: 1;
  margin: 0;
  padding: 0 20rpx;
  border: 0;
  border-radius: 999rpx;
  font-size: 27rpx;
  font-weight: 900;
  line-height: 82rpx;
  box-sizing: border-box;
}
.order-primary-button::after { border: 0; }
.share-button { color: #171717; background: #ffd400; }
.sheet-drag-zone {
  position: sticky;
  top: 0;
  z-index: 2;
  height: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0ee;
}
.sheet-handle {
  width: 64rpx;
  height: 8rpx;
  background: #e0e0e0;
  border-radius: 4rpx;
}

/* ── 状态头部 ── */
.sheet-header {
  margin-bottom: 20rpx;
}
.status-label {
  display: block;
  font-size: 36rpx;
  font-weight: 800;
  color: #171717;
  line-height: 1.3;
}
.eta-text {
  display: block;
  font-size: 26rpx;
  color: #666;
  margin-top: 8rpx;
}
.distance-text {
  display: block;
  font-size: 24rpx;
  color: #999;
  margin-top: 4rpx;
}
.reorder-button {
  background: #fff;
  border: 2rpx solid #d8d8d4;
  color: #1f1f1f;
}

/* ── 时间轴 ── */
.timeline {
  width: 100%;
  display: flex;
  align-items: flex-start;
  margin: 8rpx 0 28rpx;
}
.step {
  position: relative;
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.step-node {
  position: relative;
  width: 100%;
  height: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.step-line {
  position: absolute;
  top: 12rpx;
  right: 50%;
  width: 100%;
  height: 4rpx;
  background: #e8e8e8;
  z-index: 0;
}
.step-line.active {
  background: #f04426;
}
.step-dot {
  width: 20rpx;
  height: 20rpx;
  border-radius: 50%;
  border: 4rpx solid #fff;
  box-sizing: border-box;
  z-index: 1;
  flex-shrink: 0;
}
.step-dot.done {
  background: #f04426;
}
.step-dot.current {
  background: #f04426;
  width: 28rpx;
  height: 28rpx;
  box-shadow: 0 0 0 6rpx rgba(255, 91, 56, 0.2);
}
.step-dot.pending {
  background: #e8e8e8;
}
.step-label {
  width: 100%;
  margin-top: 10rpx;
  font-size: 20rpx;
  line-height: 1.2;
  color: #bbb;
  text-align: center;
}
.step-label.active {
  color: #333;
  font-weight: 600;
}

/* ── 订单彩蛋 ── */
.egg-card {
  position: relative;
  display: flex;
  margin: 4rpx 0 26rpx;
  overflow: hidden;
  border: 3rpx solid #f04b32;
  border-radius: 24rpx 10rpx 24rpx 24rpx;
  background: #fff8de;
  box-shadow: 8rpx 8rpx 0 rgba(25, 23, 19, 0.12);
}
.egg-card-active {
  background: #fff1ec;
}
.egg-card-accent {
  width: 14rpx;
  flex-shrink: 0;
}
.egg-card-copy {
  min-width: 0;
  flex: 1;
  padding: 24rpx 24rpx 22rpx;
}
.egg-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18rpx;
}
.egg-card-badge {
  padding: 7rpx 12rpx;
  color: #ffd400;
  background: #191713;
  border-radius: 8rpx;
  font-size: 20rpx;
  font-weight: 900;
  line-height: 1.2;
}
.egg-card-meta {
  color: #756b5c;
  font-size: 20rpx;
  font-weight: 800;
  line-height: 1.35;
  text-align: right;
}
.egg-card-title,
.egg-card-description,
.egg-card-link {
  display: block;
}
.egg-card-title {
  margin-top: 18rpx;
  color: #191713;
  font-size: 31rpx;
  font-weight: 950;
  line-height: 1.32;
}
.egg-card-description {
  margin-top: 10rpx;
  color: #62594e;
  font-size: 24rpx;
  line-height: 1.5;
}
.egg-card-link {
  margin-top: 14rpx;
  color: #191713;
  font-size: 21rpx;
  font-weight: 900;
}
.egg-reveal-backdrop {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  padding-right: 34rpx;
  padding-left: 34rpx;
  background: rgba(25, 23, 19, 0.72);
  box-sizing: border-box;
}
.egg-reveal-dialog {
  position: relative;
  width: 100%;
  max-height: 100%;
  overflow-y: auto;
  border: 4rpx solid #f04b32;
  border-radius: 34rpx 14rpx 34rpx 34rpx;
  background: #fff8de;
  box-shadow: 14rpx 16rpx 0 rgba(0, 0, 0, 0.22);
  box-sizing: border-box;
  animation: egg-reveal-in 240ms ease-out both;
}
.egg-reveal-rail {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 18rpx;
}
.egg-reveal-close {
  position: absolute;
  top: 18rpx;
  right: 18rpx;
  width: 72rpx;
  height: 72rpx;
  min-height: 0;
  margin: 0;
  padding: 0;
  border: 2rpx solid #191713;
  border-radius: 50%;
  color: #191713;
  background: #fff;
  font-size: 38rpx;
  font-weight: 700;
  line-height: 66rpx;
  z-index: 3;
}
.egg-reveal-close::after,
.egg-reveal-button::after { border: 0; }
.egg-reveal-scroll {
  width: 100%;
}
.egg-reveal-visual {
  position: relative;
  height: 112vw;
  min-height: 680rpx;
  max-height: 840rpx;
  margin-left: 18rpx;
  overflow: hidden;
  background: #f04b32;
}
.egg-reveal-image {
  width: 100%;
  height: 100%;
}
.egg-reveal-image-fallback {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  color: #ffd400;
  background: #191713;
  font-size: 24rpx;
  font-weight: 900;
  letter-spacing: 3rpx;
}
.egg-reveal-copy {
  margin-left: 18rpx;
  padding: 28rpx 30rpx 30rpx;
  background: #fff8de;
}
.egg-reveal-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}
.egg-reveal-eyebrow,
.egg-reveal-meta,
.egg-reveal-title,
.egg-reveal-description {
  display: block;
}
.egg-reveal-eyebrow {
  width: fit-content;
  padding: 9rpx 16rpx;
  color: #ffd400;
  background: #191713;
  border-radius: 8rpx;
  font-size: 23rpx;
  font-weight: 950;
  letter-spacing: 1rpx;
}
.egg-reveal-meta {
  color: #756b5c;
  font-size: 21rpx;
  font-weight: 800;
  text-align: right;
}
.egg-reveal-title {
  max-width: 540rpx;
  margin-top: 22rpx;
  color: #191713;
  font-size: 40rpx;
  font-weight: 950;
  line-height: 1.2;
}
.egg-reveal-description {
  max-width: 520rpx;
  margin-top: 14rpx;
  color: #62594e;
  font-size: 25rpx;
  line-height: 1.5;
}
.egg-reveal-footer {
  display: flex;
  flex-direction: column;
}
.egg-reveal-stamp {
  width: fit-content;
  margin: 22rpx 4rpx 0 auto;
  padding: 8rpx 15rpx;
  border: 3rpx solid;
  font-size: 20rpx;
  font-weight: 950;
  transform: rotate(-5deg);
}
.egg-reveal-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
}
.egg-reveal-button {
  min-width: 0;
  height: 78rpx;
  flex: 1;
  margin: 0;
  padding: 0 16rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 950;
  line-height: 78rpx;
}
.egg-reveal-button.accept {
  color: #191713;
  background: #ffd400;
}
.egg-reveal-button.share {
  color: #fff;
  background: #191713;
}
@keyframes egg-reveal-in {
  from { opacity: 0; transform: translateY(22rpx) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .egg-reveal-dialog { animation: none; }
}

/* ── 分隔线 ── */
.divider {
  height: 20rpx;
  background: transparent;
  margin: 0;
}

/* ── 订单详情 ── */
.order-detail,
.order-info {
  padding: 28rpx 24rpx;
  border-radius: 24rpx;
  background: #fff;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 22rpx;
}
.section-title {
  display: block;
  color: #171717;
  font-size: 30rpx;
  font-weight: 900;
  line-height: 1.25;
}
.section-meta {
  color: #9a9a9a;
  font-size: 22rpx;
  line-height: 1.25;
}
.store-title-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 18rpx;
}
.store-title-row-active {
  opacity: 0.72;
}
.store-thumb,
.dish-thumb {
  width: 64rpx;
  height: 64rpx;
  border-radius: 14rpx;
  flex-shrink: 0;
  background: #ececea;
}
.thumb-fallback,
.dish-thumb-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8b8b8b;
  font-size: 24rpx;
  font-weight: 800;
}
.store-title {
  min-width: 0;
  color: #1f1f1f;
  font-size: 29rpx;
  font-weight: 900;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dish-line {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 0;
}
.dish-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.dish-name {
  color: #1f1f1f;
  font-size: 28rpx;
  font-weight: 500;
  line-height: 1.35;
}
.dish-options {
  margin-top: 6rpx;
  color: #999;
  font-size: 22rpx;
  line-height: 1.35;
}
.dish-qty {
  width: 54rpx;
  color: #999;
  font-size: 26rpx;
  text-align: center;
  flex-shrink: 0;
  line-height: 1.35;
}
.dish-price {
  width: 138rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}
.unit-price {
  margin-top: 5rpx;
  color: #999;
  font-size: 20rpx;
  line-height: 1.3;
}
.paid-price {
  color: #171717;
  font-size: 29rpx;
  font-weight: 900;
  line-height: 1.3;
}
.fee-line,
.total-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24rpx;
  padding: 14rpx 0 0;
  color: #777;
  font-size: 27rpx;
  line-height: 1.35;
}
.total-line {
  margin-top: 20rpx;
  padding-top: 22rpx;
  border-top: 1rpx solid #eeeeeb;
  color: #1f1f1f;
  font-size: 30rpx;
  font-weight: 900;
}
.total-line text:last-child {
  color: #ff3b30;
  font-size: 38rpx;
}
.order-info {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}
.compact-info {
  margin-top: 20rpx;
}
.info-row {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
}
.info-label {
  width: 130rpx;
  flex-shrink: 0;
  color: #999;
  font-size: 27rpx;
  font-weight: 700;
  line-height: 1.45;
}
.info-value {
  flex: 1;
  min-width: 0;
  color: #171717;
  font-size: 27rpx;
  font-weight: 500;
  line-height: 1.45;
  text-align: right;
  word-break: break-all;
}
.mono-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.order-number-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8rpx;
}
.order-number {
  flex: initial;
  color: #171717;
  background: transparent;
  font-size: 24rpx;
  line-height: 1.45;
}
.copy-text {
  flex-shrink: 0;
  color: #999;
  font-size: 24rpx;
  font-weight: 800;
}

/* ── 骑手信息 ── */
.rider-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.rider-avatar {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: #f0f4ff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.rider-image { width: 58rpx; height: 58rpx; }
.rider-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.rider-name {
  font-size: 30rpx;
  font-weight: 700;
  color: #171717;
}
.rider-tag {
  font-size: 22rpx;
  color: #999;
  margin-top: 4rpx;
}
.contact-btn {
  padding: 14rpx 28rpx;
  border-radius: 32rpx;
  background: #f5f5f5;
  flex-shrink: 0;
}
.contact-text {
  font-size: 24rpx;
  color: #333;
  font-weight: 600;
}

/* ── 路线信息 ── */
.route-info {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  padding: 28rpx 24rpx;
  border-radius: 24rpx;
  background: #fff;
}
.route-point {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
}
.route-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  margin-top: 8rpx;
  flex-shrink: 0;
}
.route-dot.origin {
  background: #f04426;
}
.route-dot.dest {
  background: #00b450;
}
.route-text {
  flex: 1;
  min-width: 0;
}
.route-label {
  display: block;
  font-size: 22rpx;
  color: #999;
}
.route-value {
  display: block;
  font-size: 26rpx;
  color: #333;
  font-weight: 600;
  margin-top: 2rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.route-connector {
  width: 2rpx;
  height: 28rpx;
  background: #e0e0e0;
  margin-left: 7rpx;
}

/* ── 空状态 ── */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}
.empty-text {
  font-size: 30rpx;
  color: #999;
}
</style>
