<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useOrderStore } from '../../stores/orders';

interface ChooseAvatarEvent {
  detail: {
    avatarUrl: string;
  };
}

const auth = useAuthStore();
const orders = useOrderStore();
const avatarUrl = ref('');
const nickname = ref('');
const loading = ref(false);

function chooseAvatar(event: ChooseAvatarEvent) {
  avatarUrl.value = event.detail.avatarUrl;
}

async function login() {
  if (loading.value) return;
  const trimmedNickname = nickname.value.trim();
  if (!avatarUrl.value || !trimmedNickname) {
    uni.showToast({ title: '请先选择头像并填写昵称', icon: 'none' });
    return;
  }

  loading.value = true;
  try {
    await auth.wechatLogin({
      avatarUrl: avatarUrl.value,
      nickname: trimmedNickname,
    });
    uni.showToast({ title: '登录成功', icon: 'success' });
  } catch {
    uni.showToast({ title: '登录失败，请重试', icon: 'none' });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <view class="page">
    <view v-if="auth.accountId" class="card profile">
      <image class="avatar" :src="auth.userProfile.avatarUrl" mode="aspectFill" />
      <view class="identity">
        <text class="title">{{ auth.userProfile.nickname }}</text>
        <text class="muted">微信用户 · 已登录</text>
      </view>
      <text class="muted order-count">最近虚拟订单：{{ orders.orders.length }} 单</text>
    </view>

    <view v-else class="card login-card">
      <text class="title">登录白吃了</text>
      <text class="muted">登录后会合并游客订单，并在这里显示你的头像和昵称。</text>

      <view class="profile-form">
        <button class="avatar-picker" open-type="chooseAvatar" @chooseavatar="chooseAvatar">
          <image v-if="avatarUrl" class="avatar" :src="avatarUrl" mode="aspectFill" />
          <text v-else class="avatar-placeholder">选择头像</text>
        </button>
        <input
          v-model="nickname"
          class="nickname-input"
          type="nickname"
          maxlength="32"
          placeholder="填写昵称"
        />
      </view>

      <button class="primary-button login-button" :loading="loading" @tap="login">
        微信登录
      </button>
      <text class="muted">你也可以继续以游客身份浏览和下单。</text>
    </view>

    <view class="card notice">
      <text>关于白吃了</text>
      <text class="muted">这是互动模拟产品，不提供真实支付、接单或配送。</text>
    </view>
    <view class="tab-spacer" />
  </view>
</template>

<style scoped>
.profile,
.login-card,
.notice {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.profile {
  position: relative;
  min-height: 112rpx;
  padding-left: 164rpx;
  justify-content: center;
}

.profile > .avatar {
  position: absolute;
  left: 24rpx;
  top: 24rpx;
}

.identity {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.title {
  font-size: 36rpx;
  font-weight: 700;
}

.order-count {
  margin-top: 8rpx;
}

.profile-form {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin: 18rpx 0 10rpx;
}

.avatar-picker {
  width: 112rpx;
  height: 112rpx;
  padding: 0;
  border-radius: 50%;
  overflow: hidden;
  background: #f2f2f2;
}

.avatar-picker::after {
  border: 0;
}

.avatar,
.avatar-placeholder {
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
}

.avatar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #777;
  font-size: 22rpx;
}

.nickname-input {
  flex: 1;
  height: 84rpx;
  padding: 0 24rpx;
  box-sizing: border-box;
  border-radius: 16rpx;
  background: #f6f6f6;
  font-size: 28rpx;
}

.login-button {
  width: 100%;
  margin-top: 8rpx;
}

.notice {
  margin-top: 20rpx;
}

.tab-spacer {
  height: 120rpx;
}
</style>
