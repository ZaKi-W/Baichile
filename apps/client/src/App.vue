<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app';
import { useAuthStore } from './stores/auth';

onLaunch(() => {
  useAuthStore().ensureGuest();
});

onShow(() => {
  uni.removeTabBarBadge({ index: 3 });
});
</script>

<style lang="scss">
page {
  --brand-yellow: #ffd400;
  --brand-black: #171717;
  --brand-red: #f04426;
  --brand-green: #259b58;
  --surface: #ffffff;
  --page-bg: #f6f6f6;
  --line: #ececec;
  --muted: #777777;
  background: var(--page-bg);
  color: var(--brand-black);
  font-family: "PingFang SC", sans-serif;
}
button {
  margin: 0;
}
.page {
  min-height: 100vh;
  padding: 24rpx 24rpx calc(48rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.card {
  border: 1rpx solid var(--line);
  background: var(--surface);
  border-radius: 24rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}
.muted {
  color: #777;
  font-size: 24rpx;
}
.primary-button {
  background: var(--brand-yellow);
  color: var(--brand-black);
  border-radius: 999rpx;
  font-size: 28rpx;
  font-weight: 800;
}
.virtual-notice {
  padding: 20rpx;
  border-radius: 16rpx;
  background: #fff7cf;
  color: #665300;
  font-size: 24rpx;
}

/* #ifdef H5 */
html,
body {
  background: #dededb;
}

uni-app {
  display: block;
  width: 100%;
  max-width: 480px;
  min-height: 100vh;
  margin: 0 auto;
  overflow-x: hidden;
  background: var(--page-bg);
  box-shadow: 0 0 36px rgba(23, 23, 23, 0.16);
}

.uni-tabbar-bottom .uni-tabbar,
.uni-tabbar-top .uni-tabbar {
  right: auto !important;
  left: 50% !important;
  width: min(100%, 480px) !important;
  transform: translateX(-50%);
}

.mask,
.overlay {
  right: auto !important;
  left: 50% !important;
  width: min(100vw, 480px) !important;
  transform: translateX(-50%);
}

.bottom-bar,
.achievement-header,
.achievement-actions,
.achievement-visitor {
  right: auto !important;
  left: 50% !important;
  width: min(100vw, 480px) !important;
  box-sizing: border-box;
  transform: translateX(-50%);
}

.checkout-bar,
.submit-btn,
.order-share-actions,
.order-visitor-actions {
  right: auto !important;
  left: 50% !important;
  width: min(calc(100vw - 48rpx), calc(480px - 48rpx)) !important;
  box-sizing: border-box;
  transform: translateX(-50%);
}
/* #endif */
</style>
