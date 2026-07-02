<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useAuthStore } from '../../stores/auth';
import { useOrderStore } from '../../stores/orders';
import { useAddressStore } from '../../stores/address';

interface ChooseAvatarEvent {
  detail: {
    avatarUrl: string;
  };
}

const auth = useAuthStore();
const orders = useOrderStore();
const addresses = useAddressStore();
const showLoginPopup = ref(false);
const avatarUrl = ref('');
const nickname = ref('');
const loading = ref(false);

onShow(() => {
  void orders.load();
  void addresses.load();
});

function openLogin() {
  showLoginPopup.value = true;
}

function openAddresses() {
  uni.navigateTo({ url: '/pages/address-list/index' });
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
    void orders.load();
    void addresses.load();
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '登录失败，请重试',
      icon: 'none',
    });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <view class="page">
    <!-- Logged in hero -->
    <view v-if="auth.accountId" class="hero logged-in">
      <view class="profile-header">
        <image class="avatar" :src="auth.userProfile.avatarUrl" mode="aspectFill" />
        <view class="identity">
          <text class="nickname">{{ auth.userProfile.nickname }}</text>
          <view class="badge">
            <text class="badge-text">微信用户</text>
          </view>
        </view>
      </view>
      <view class="stats-row">
        <view class="stat-item">
          <text class="stat-value">{{ orders.orders.length }}</text>
          <text class="stat-label">虚拟订单</text>
        </view>
      </view>
    </view>

    <!-- Not logged in hero -->
    <view v-else class="hero guest">
      <view class="guest-icon">👤</view>
      <text class="guest-title">登录白吃了</text>
      <text class="guest-desc">登录后会合并游客订单，并在这里显示你的头像和昵称</text>
      <button class="login-btn" @tap="openLogin">
        <text class="login-btn-text">微信登录</text>
      </button>
      <text class="guest-hint">你也可以继续以游客身份浏览和下单</text>
    </view>

    <!-- Menu section -->
    <view class="menu-card">
      <view class="menu-item">
        <text class="menu-icon">📦</text>
        <text class="menu-text">我的订单</text>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-divider" />
      <view class="menu-item" @tap="openAddresses">
        <text class="menu-icon">📍</text>
        <text class="menu-text">收货地址</text>
        <text class="menu-count">{{ addresses.addresses.length }}</text>
        <text class="menu-arrow">›</text>
      </view>
    </view>

    <!-- About section -->
    <view class="about-card">
      <view class="about-header">
        <text class="about-title">关于白吃了</text>
      </view>
      <text class="about-desc">这是互动模拟产品，不提供真实支付、接单或配送。</text>
      <view class="about-meta">
        <text class="version">v1.0.0</text>
      </view>
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
.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 0;
  padding-bottom: 120rpx;
}

/* Hero section */
.hero {
  background: linear-gradient(135deg, #ff7a45 0%, #ff9a6c 100%);
  padding: 60rpx 40rpx 50rpx;
  margin-bottom: 24rpx;
}

/* Logged in hero */
.hero.logged-in .profile-header {
  display: flex;
  align-items: center;
  gap: 28rpx;
}

.hero.logged-in .avatar {
  width: 140rpx;
  height: 140rpx;
  border-radius: 50%;
  border: 4rpx solid rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}

.hero.logged-in .identity {
  flex: 1;
  min-width: 0;
}

.hero.logged-in .nickname {
  font-size: 40rpx;
  font-weight: 600;
  color: #fff;
  margin-bottom: 12rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero.logged-in .badge {
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.2);
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
}

.hero.logged-in .badge-text {
  font-size: 22rpx;
  color: #fff;
}

.stats-row {
  display: flex;
  margin-top: 36rpx;
  padding-top: 32rpx;
  border-top: 1rpx solid rgba(255, 255, 255, 0.2);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.stat-value {
  font-size: 44rpx;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}

.stat-label {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.8);
  margin-top: 8rpx;
}

/* Guest hero */
.hero.guest {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 80rpx 40rpx 60rpx;
}

.guest-icon {
  width: 120rpx;
  height: 120rpx;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 60rpx;
  margin-bottom: 32rpx;
}

.guest-title {
  font-size: 40rpx;
  font-weight: 700;
  color: #fff;
  margin-bottom: 16rpx;
}

.guest-desc {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.5;
  margin-bottom: 40rpx;
  max-width: 500rpx;
}

.login-btn {
  width: 400rpx;
  height: 88rpx;
  background: #fff;
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.1);
  margin-bottom: 24rpx;
}

.login-btn::after {
  border: 0;
}

.login-btn-text {
  font-size: 30rpx;
  font-weight: 600;
  color: #ff7a45;
}

.guest-hint {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.7);
}

/* Menu card */
.menu-card {
  background: #fff;
  margin: 0 24rpx 24rpx;
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 32rpx 28rpx;
}

.menu-icon {
  font-size: 40rpx;
  margin-right: 20rpx;
}

.menu-text {
  flex: 1;
  font-size: 30rpx;
  color: #333;
}

.menu-arrow {
  font-size: 36rpx;
  color: #ccc;
}

.menu-divider {
  height: 1rpx;
  background: #f0f0f0;
  margin: 0 28rpx;
}

/* About card */
.about-card {
  background: #fff;
  margin: 0 24rpx;
  border-radius: 20rpx;
  padding: 32rpx 28rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.about-header {
  margin-bottom: 16rpx;
}

.about-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #333;
}

.about-desc {
  font-size: 26rpx;
  color: #888;
  line-height: 1.6;
  display: block;
}

.about-meta {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #f0f0f0;
}

.version {
  font-size: 24rpx;
  color: #aaa;
}

.tab-spacer {
  height: 40rpx;
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
