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
const showLoginPopup = ref(false);
const avatarUrl = ref('');
const nickname = ref('');
const loading = ref(false);

function openLogin() {
  showLoginPopup.value = true;
}

function closeLogin() {
  if (loading.value) return;
  showLoginPopup.value = false;
}

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
    showLoginPopup.value = false;
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
      <view class="profile-header">
        <image class="avatar" :src="auth.userProfile.avatarUrl" mode="aspectFill" />
        <view class="identity">
          <text class="title">{{ auth.userProfile.nickname }}</text>
          <text class="muted">微信用户 · 已登录</text>
        </view>
      </view>
      <view class="profile-stats">
        <text class="muted">最近虚拟订单：{{ orders.orders.length }} 单</text>
      </view>
    </view>

    <view v-else class="card login-card">
      <view class="login-header">
        <text class="title">登录白吃了</text>
        <text class="muted">登录后会合并游客订单，并在这里显示你的头像和昵称。</text>
      </view>
      <button class="primary-button login-button" @tap="openLogin">微信登录</button>
      <text class="muted login-footer">你也可以继续以游客身份浏览和下单。</text>
    </view>

    <view class="card notice">
      <text>关于白吃了</text>
      <text class="muted">这是互动模拟产品，不提供真实支付、接单或配送。</text>
    </view>
    <view class="tab-spacer" />

    <!-- Login Popup -->
    <view :style="showLoginPopup ? '' : 'display:none'" class="overlay">
      <view class="popup" @tap.stop>
        <view class="popup-header">
          <text class="popup-title">完善登录信息</text>
          <text class="popup-close" @tap="closeLogin">✕</text>
        </view>
        <text class="popup-desc">选择微信头像和昵称，登录后会合并游客订单。</text>

        <view class="popup-form">
          <view class="form-avatar">
            <button class="avatar-picker" open-type="chooseAvatar" @chooseavatar="chooseAvatar">
              <image v-if="avatarUrl" class="avatar-preview" :src="avatarUrl" mode="aspectFill" />
              <view v-else class="avatar-placeholder">
                <text class="placeholder-icon">+</text>
                <text class="placeholder-text">选择头像</text>
              </view>
            </button>
            <text class="form-hint">点击获取微信头像</text>
          </view>

          <view class="form-nickname">
            <text class="form-label">昵称</text>
            <input
              v-model="nickname"
              class="nickname-input"
              type="nickname"
              maxlength="32"
              placeholder="点击选择微信昵称"
            />
            <text class="form-hint">点击输入框可选择微信昵称</text>
          </view>
        </view>

        <view class="popup-actions">
          <button class="cancel-button" :disabled="loading" @tap="closeLogin">取消</button>
          <button class="primary-button confirm-button" :loading="loading" :disabled="!avatarUrl || !nickname.trim()" @tap="login">确认登录</button>
        </view>
      </view>
    </view>
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

.profile-header {
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.profile-header > .avatar {
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
  flex-shrink: 0;
}

.identity {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.profile-stats {
  padding-top: 12rpx;
  border-top: 1rpx solid #f0f0f0;
}

.login-header {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.title {
  font-size: 36rpx;
  font-weight: 700;
}

.login-button {
  width: 100%;
  margin-top: 12rpx;
}

.login-footer {
  text-align: center;
  margin-top: 8rpx;
}

.notice {
  margin-top: 20rpx;
}

.tab-spacer {
  height: 120rpx;
}

/* Overlay */
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

/* Popup */
.popup {
  width: 620rpx;
  background: #fff;
  border-radius: 24rpx;
  padding: 40rpx 36rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.popup-title {
  font-size: 34rpx;
  font-weight: 700;
}

.popup-close {
  font-size: 36rpx;
  color: #999;
  padding: 8rpx 16rpx;
}

.popup-desc {
  font-size: 24rpx;
  color: #999;
  text-align: center;
}

.popup-form {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  margin: 16rpx 0;
  padding: 24rpx;
  background: #fafafa;
  border-radius: 16rpx;
}

.form-avatar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}

.avatar-picker {
  width: 140rpx;
  height: 140rpx;
  padding: 0;
  border-radius: 50%;
  overflow: hidden;
  background: #e8e8e8;
  line-height: normal;
}

.avatar-picker::after {
  border: 0;
}

.avatar-preview {
  width: 140rpx;
  height: 140rpx;
  border-radius: 50%;
}

.avatar-placeholder {
  width: 140rpx;
  height: 140rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
}

.placeholder-icon {
  font-size: 40rpx;
  color: #999;
  line-height: 1;
}

.placeholder-text {
  font-size: 20rpx;
  color: #999;
}

.form-hint {
  font-size: 22rpx;
  color: #aaa;
}

.form-nickname {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.form-label {
  font-size: 26rpx;
  color: #555;
  font-weight: 500;
}

.nickname-input {
  height: 84rpx;
  padding: 0 24rpx;
  box-sizing: border-box;
  border-radius: 16rpx;
  background: #fff;
  font-size: 28rpx;
  border: 1rpx solid #e8e8e8;
}

.popup-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 8rpx;
}

.cancel-button {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  font-size: 28rpx;
  border-radius: 999rpx;
  background: #f2f2f2;
  color: #555;
}

.cancel-button::after {
  border: 0;
}

.confirm-button {
  flex: 2;
  height: 80rpx;
  line-height: 80rpx;
  font-size: 28rpx;
}

.confirm-button[disabled] {
  opacity: 0.5;
}
</style>
