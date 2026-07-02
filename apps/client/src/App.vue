<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app';
import { useAuthStore } from './stores/auth';
import { CODE_VERSION } from './config/code-version';

onLaunch(() => {
  useAuthStore().ensureGuest();
});

onShow(() => {
  uni.setTabBarBadge({
    index: 3,
    text: String(CODE_VERSION),
  });
});
</script>

<style lang="scss">
page {
  background: #f6f6f6;
  color: #202020;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
button {
  margin: 0;
}
.page {
  min-height: 100vh;
  padding: 24rpx;
  box-sizing: border-box;
}
.card {
  background: #fff;
  border-radius: 20rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}
.muted {
  color: #777;
  font-size: 24rpx;
}
.primary-button {
  background: #ff7a45;
  color: #fff;
  border-radius: 999rpx;
  font-size: 28rpx;
}
.virtual-notice {
  padding: 20rpx;
  border-radius: 16rpx;
  background: #fff4e8;
  color: #8a4b22;
  font-size: 24rpx;
}
</style>
