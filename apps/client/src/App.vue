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
</style>
