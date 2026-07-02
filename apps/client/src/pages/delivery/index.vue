<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { catalogService } from '../../services/catalog';
import { useAddressStore } from '../../stores/address';
import { useCartStore } from '../../stores/cart';
import { useOrderStore } from '../../stores/orders';
import { getOrderStepIndex, ORDER_STEPS } from '../../utils/order-status';
import { findDeliveryIncident, getDeliveryIncidentPhase } from '@baichile/domain';

const orders = useOrderStore();
const addressStore = useAddressStore();
const cart = useCartStore();

const orderId = ref('');
const storeName = ref('商家');
const storeDistanceKm = ref(3);
const storeDeliveryMinutes = ref(30);
let mapCtx: UniApp.MapContext | null = null;
const mapReady = ref(false);
let cameraFramed = false;

const statusBarHeight = uni.getSystemInfoSync().statusBarHeight ?? 20;
const safeTopStyle = { paddingTop: `${statusBarHeight + 8}px` };

const order = computed(() => orders.find(orderId.value));

/* ── delivery address ── */
const deliveryAddress = computed(() => {
  if (!order.value) return '';
  const addr = addressStore.addresses.find((a) => a.id === order.value!.virtualDestinationId);
  return addr ? `${addr.address}${addr.detail ? ' ' + addr.detail : ''}` : '配送地址';
});

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
        content: storeName.value,
        display: 'ALWAYS' as const,
        fontSize: 13,
        borderRadius: 6,
        padding: 6,
        bgColor: '#ffffff',
        color: '#151515',
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
        color: '#151515',
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
const now = ref(Date.now());
let stepTimer: ReturnType<typeof setInterval> | undefined;
let failureRefreshRequested = false;

const incidentPhase = computed(() => order.value?.incident
  ? getDeliveryIncidentPhase(order.value.incident, now.value)
  : 'pending');
const incidentDefinition = computed(() => order.value?.incident
  ? findDeliveryIncident(order.value.incident.key)
  : undefined);
const hasIncident = computed(() => incidentPhase.value === 'incident');
const hasFailed = computed(() => incidentPhase.value === 'failed');
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
  currentStepIndex.value = hasIncident.value || hasFailed.value
    ? FINAL_STEP
    : getOrderStepIndex(startedAt, order.value!.durationMs, now.value);
  if (hasFailed.value && !failureRefreshRequested) {
    failureRefreshRequested = true;
    void orders.load();
  }
}

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
  const min = order.value ? Math.round(order.value.durationMs / 60_000) : storeDeliveryMinutes.value;
  return `预计 ${min} 分钟送达`;
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
    storeDistanceKm.value = detail.distanceKm || 3;
    storeDeliveryMinutes.value = detail.virtualDeliveryMinutes || 30;
  } catch {
    storeName.value = '商家';
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

/* ── lifecycle ── */
onLoad(async (options) => {
  orderId.value = options?.id || '';
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
    <view class="bottom-sheet">
      <view class="sheet-handle" />

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

      <button v-if="hasFailed" class="reorder-button" @tap="goToStore">重新点一单</button>

      <!-- 分隔线 -->
      <view class="divider" />

      <!-- 骑手信息 -->
      <view class="rider-row">
        <view class="rider-avatar">
          <text class="rider-emoji">🛵</text>
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

      <!-- 路线信息 -->
      <view class="route-info">
        <view class="route-point">
          <view class="route-dot origin" />
          <view class="route-text">
            <text class="route-label">商家</text>
            <text class="route-value">{{ storeName }}</text>
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
  color: #151515;
  line-height: 1;
}

/* ── 底部面板 ── */
.bottom-sheet {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
  background: #ffffff;
  border-radius: 32rpx 32rpx 0 0;
  padding: 20rpx 32rpx calc(28rpx + env(safe-area-inset-bottom));
  box-shadow: 0 -8rpx 40rpx rgba(0, 0, 0, 0.08);
  max-height: 58vh;
  overflow-y: auto;
}
.sheet-handle {
  width: 64rpx;
  height: 8rpx;
  background: #e0e0e0;
  border-radius: 4rpx;
  margin: 0 auto 24rpx;
}

/* ── 状态头部 ── */
.sheet-header {
  margin-bottom: 20rpx;
}
.status-label {
  display: block;
  font-size: 36rpx;
  font-weight: 800;
  color: #151515;
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
  margin: 24rpx 0 4rpx;
  border: 0;
  border-radius: 999rpx;
  background: #ff5b38;
  color: #fff;
  font-size: 28rpx;
  font-weight: 700;
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
  background: #ff5b38;
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
  background: #ff5b38;
}
.step-dot.current {
  background: #ff5b38;
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

/* ── 分隔线 ── */
.divider {
  height: 1rpx;
  background: #f0f0f0;
  margin: 20rpx 0;
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
.rider-emoji {
  font-size: 36rpx;
}
.rider-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.rider-name {
  font-size: 30rpx;
  font-weight: 700;
  color: #151515;
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
  background: #ff5b38;
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
