<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow, onUnload } from '@dcloudio/uni-app';
import { isWebPlatform, useAuthStore, type LoginContinuation } from '../../stores/auth';
import { useOrderStore } from '../../stores/orders';
import { useAddressStore } from '../../stores/address';
import { useWalletStore } from '../../stores/wallet';
import { useCartStore } from '../../stores/cart';
import { CODE_VERSION } from '../../config/code-version';
import { orderService } from '../../services/orders';
import { ApiRequestError } from '../../services/http';
import { consumePendingOrders } from '../../utils/pending-order';
import { shareService } from '../../services/shares';
import { shareLandingUrl } from '../../utils/share-navigation';

interface ChooseAvatarEvent {
  detail: {
    avatarUrl: string;
  };
}

const auth = useAuthStore();
const orders = useOrderStore();
const addresses = useAddressStore();
const wallet = useWalletStore();
const cart = useCartStore();
const isWeb = isWebPlatform();
const showLoginPopup = ref(false);
const avatarUrl = ref('');
const nickname = ref('');
const phoneNumber = ref('');
const phoneCode = ref('');
const smsCooldown = ref(0);
const sendingCode = ref(false);
const bindingPhone = ref(false);
const loading = ref(false);
const walletAction = ref<'check-in' | ''>('');
const preparingShare = ref(false);
let verifyPhoneOtp: ((code: string) => Promise<string>) | undefined;
let smsTimer: ReturnType<typeof setInterval> | undefined;

const loginButtonLabel = computed(() => isWeb ? '手机号登录' : '微信登录');
const accountBadge = computed(() => auth.provider === 'phone' ? '手机号用户' : '微信用户');

onShow(() => {
  void orders.load();
  void addresses.load();
  if (auth.accountId) {
    void wallet.load().catch(() => uni.showToast({ title: '余额加载失败', icon: 'none' }));
    if (!isWeb && !/^(cloud:\/\/|https:\/\/)/.test(auth.userProfile.avatarUrl)) {
      avatarUrl.value = '';
      nickname.value = auth.userProfile.nickname;
      showLoginPopup.value = true;
    }
  }
  else if (auth.consumeLoginRequest()) showLoginPopup.value = true;
});

onUnload(() => {
  if (smsTimer) clearInterval(smsTimer);
});

function openLogin(continuation: LoginContinuation = '') {
  if (continuation) {
    auth.requestLogin(continuation);
    auth.consumeLoginRequest();
  }
  showLoginPopup.value = true;
}

function openAddresses() {
  uni.navigateTo({ url: '/pages/address-list/index' });
}

function openWallet() {
  if (!auth.accountId) {
    openLogin('wallet');
    return;
  }
  uni.navigateTo({ url: '/pages/wallet/index' });
}

function openPersonalityTest() {
  uni.navigateTo({ url: '/pages/personality-test/index' });
}

async function shareAchievement() {
  if (!auth.accountId) {
    openLogin('share-achievement');
    return;
  }
  if (preparingShare.value) return;
  preparingShare.value = true;
  try { const card = await shareService.create({ kind: 'achievement', showIdentity: true }); uni.navigateTo({ url: shareLandingUrl(card) }); }
  catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '分享准备失败', icon: 'none' }); }
  finally { preparingShare.value = false; }
}

function openShareReward() {
  if (!auth.accountId) {
    openLogin('share-reward');
    return;
  }
  uni.navigateTo({ url: '/pages/share-reward/index' });
}
function openOrders() { uni.switchTab({ url: '/pages/orders/index' }); }

async function checkIn() {
  if (!auth.accountId) {
    openLogin('check-in');
    return;
  }
  if (wallet.summary.checkedInToday || walletAction.value) return;
  walletAction.value = 'check-in';
  try {
    await wallet.checkIn();
    uni.showToast({ title: '签到成功，获得 ¥500', icon: 'success' });
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '签到失败', icon: 'none' });
  } finally {
    walletAction.value = '';
  }
}

function closeLogin() {
  if (loading.value) return;
  showLoginPopup.value = false;
}

function startSmsCooldown() {
  smsCooldown.value = 60;
  if (smsTimer) clearInterval(smsTimer);
  smsTimer = setInterval(() => {
    smsCooldown.value -= 1;
    if (smsCooldown.value <= 0 && smsTimer) {
      clearInterval(smsTimer);
      smsTimer = undefined;
    }
  }, 1000);
}

async function sendPhoneCode() {
  if (sendingCode.value || smsCooldown.value) return;
  sendingCode.value = true;
  try {
    // #ifdef H5
    const { sendWebPhoneOtp } = await import('../../platform/cloudbase-web');
    verifyPhoneOtp = await sendWebPhoneOtp(phoneNumber.value);
    startSmsCooldown();
    uni.showToast({ title: '验证码已发送', icon: 'success' });
    return;
    // #endif
    throw new Error('当前平台不支持手机号验证码登录');
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '验证码发送失败', icon: 'none' });
  } finally {
    sendingCode.value = false;
  }
}

async function loginWithPhone() {
  if (loading.value) return;
  if (!verifyPhoneOtp) {
    uni.showToast({ title: '请先获取验证码', icon: 'none' });
    return;
  }
  loading.value = true;
  try {
    const verifiedPhone = await verifyPhoneOtp(phoneCode.value);
    await auth.createWebPhoneSession(verifiedPhone);
    await completeLogin();
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '手机号登录失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
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
    await completeLogin();
    void submitPendingOrderAfterLogin();
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '登录失败，请重试',
      icon: 'none',
    });
  } finally {
    loading.value = false;
  }
}

async function completeLogin() {
  showLoginPopup.value = false;
  phoneCode.value = '';
  verifyPhoneOtp = undefined;
  uni.showToast({ title: '登录成功', icon: 'success' });
  await Promise.all([
    orders.load(),
    addresses.load(),
    wallet.load().catch(() => undefined),
  ]);
  const continuation = auth.consumeLoginContinuation();
  if (continuation === 'wallet') uni.navigateTo({ url: '/pages/wallet/index' });
  else if (continuation === 'check-in') await checkIn();
  else if (continuation === 'share-achievement') await shareAchievement();
  else if (continuation === 'share-reward') openShareReward();
  else if (continuation.startsWith('share-order:') || continuation.startsWith('share-egg:')) {
    const [kind, orderId] = continuation.split(':');
    const card = await shareService.create({
      kind: kind === 'share-egg' ? 'order_egg' : 'order',
      orderId,
      showIdentity: true,
    });
    uni.navigateTo({ url: shareLandingUrl(card) });
  }
}

async function logout() {
  if (!isWeb || loading.value) return;
  loading.value = true;
  try {
    await auth.logoutWebPhone();
    await Promise.all([orders.load(), addresses.load()]);
    wallet.$reset();
    uni.showToast({ title: '已退出登录', icon: 'success' });
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '退出失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function bindWechatPhone(event: { detail?: { code?: string; errMsg?: string } }) {
  const code = event.detail?.code;
  if (!code || bindingPhone.value) {
    if (!code && !event.detail?.errMsg?.includes('deny')) {
      uni.showToast({ title: '未获取到手机号授权，请重试', icon: 'none' });
    }
    return;
  }
  bindingPhone.value = true;
  try {
    const result = await auth.bindWechatPhone(code);
    await Promise.all([orders.load(), addresses.load(), wallet.load(true)]);
    const migratedCount = result.migrated.orders + result.migrated.addresses;
    uni.showToast({
      title: result.merged ? `已同步 ${migratedCount} 项 Web 数据` : '手机号绑定成功',
      icon: 'success',
      duration: 2400,
    });
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '手机号绑定失败', icon: 'none' });
  } finally {
    bindingPhone.value = false;
  }
}

async function submitPendingOrderAfterLogin() {
  const pending = consumePendingOrders();
  if (!pending.length) return;
  const created = [];
  try {
    for (const request of pending) {
      const order = await orderService.create(request);
      created.push(order);
      orders.save(order);
    }
    wallet.recordPayment(created.reduce((sum, order) => sum + order.totalCents, 0));
    cart.clear();
    if (created.length === 1) uni.navigateTo({ url: `/pages/delivery/index?id=${created[0].id}` });
    else uni.switchTab({ url: '/pages/orders/index' });
    void wallet.load().catch(() => undefined);
  } catch (error) {
    if (created.length) {
      wallet.recordPayment(created.reduce((sum, order) => sum + order.totalCents, 0));
      cart.clear();
      void wallet.load().catch(() => undefined);
      uni.showToast({ title: `已生成${created.length}个订单，剩余订单未完成`, icon: 'none' });
      uni.switchTab({ url: '/pages/orders/index' });
      return;
    }
    const insufficient = error instanceof ApiRequestError && error.code === 'INSUFFICIENT_BALANCE';
    uni.showToast({ title: insufficient ? '余额不足' : '登录成功，但订单创建失败，请重新提交', icon: 'none' });
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
            <text class="badge-text">{{ accountBadge }}</text>
          </view>
        </view>
      </view>
      <view class="stats-row">
        <view class="stat-item">
          <text class="stat-value">{{ orders.savings.completedOrderCount }}</text>
          <text class="stat-label">完成订单</text>
        </view>
        <view class="stat-item">
          <text class="stat-value">¥{{ (orders.savings.savedMoneyCents / 100).toFixed(2) }}</text>
          <text class="stat-label">累计实付</text>
        </view>
        <view class="stat-item">
          <text class="stat-value">{{ orders.savings.savedCaloriesKcal }}</text>
          <text class="stat-label">约省卡路里</text>
        </view>
      </view>
    </view>

    <!-- Not logged in hero -->
    <view v-else class="hero guest">
      <view class="guest-icon"><image src="/static/tabbar/profile.svg" mode="aspectFit" /></view>
      <text class="guest-title">登录这顿白吃</text>
      <text class="guest-desc">{{ isWeb ? '登录后自动合并本机试玩订单，解锁钱包、签到和分享奖励' : '登录后会合并游客订单，并在这里显示你的头像和昵称' }}</text>
      <button class="login-btn" @tap="openLogin()">
        <text class="login-btn-text">{{ loginButtonLabel }}</text>
      </button>
      <text class="guest-hint">{{ isWeb ? '不登录也能完成基础模拟点餐' : '你可以先浏览店铺，登录后使用虚拟余额下单' }}</text>
    </view>

    <view v-if="auth.accountId" class="wallet-card">
      <view class="wallet-balance" @tap="openWallet">
        <text class="wallet-label">虚拟余额</text>
        <view class="wallet-amount-row">
          <text class="wallet-currency">¥</text>
          <text class="wallet-amount">{{ (wallet.summary.balanceCents / 100).toFixed(2) }}</text>
          <text class="wallet-arrow">›</text>
        </view>
        <text class="wallet-note">仅限应用内体验，不可充值或提现</text>
      </view>
      <view class="wallet-actions">
        <button
          class="wallet-action check-in"
          :loading="walletAction === 'check-in'"
          :disabled="wallet.summary.checkedInToday || !!walletAction"
          @tap="checkIn"
        >
          {{ wallet.summary.checkedInToday ? '今日已签到' : '签到领 ¥500' }}
        </button>
        <button
          class="wallet-action share-reward"
          :loading="preparingShare"
          @tap="openShareReward"
        >
          分享领饭钱
        </button>
      </view>
    </view>

    <!-- Menu section -->
    <view class="menu-card">
      <view
        class="menu-item"
        @tap="shareAchievement"
      >
        <text class="menu-icon">战</text>
        <text class="menu-text">晒晒我的白吃战绩</text>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-divider" />
      <view class="menu-item" @tap="openWallet">
        <text class="menu-icon">钱</text>
        <text class="menu-text">我的钱包</text>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-divider" />
      <view class="menu-item" @tap="openOrders">
        <text class="menu-icon">单</text>
        <text class="menu-text">我的订单</text>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-divider" />
      <view class="menu-item" @tap="openPersonalityTest">
        <text class="menu-icon">享</text>
        <text class="menu-text">测测我的白吃人格</text>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-divider" />
      <view class="menu-item" @tap="openAddresses">
        <image class="menu-icon image-icon" src="/static/icons/location.svg" mode="aspectFit" />
        <text class="menu-text">收货地址</text>
        <text class="menu-arrow">›</text>
      </view>
      <template v-if="auth.accountId && !isWeb && auth.provider === 'wechat'">
        <view class="menu-divider" />
        <button
          class="menu-item bind-phone-button"
          open-type="getPhoneNumber"
          :loading="bindingPhone"
          @getphonenumber="bindWechatPhone"
        >
          <text class="menu-icon phone-icon">机</text>
          <text class="menu-text">绑定手机号并同步网页版</text>
          <text class="menu-arrow">›</text>
        </button>
      </template>
      <template v-if="auth.accountId && isWeb">
        <view class="menu-divider" />
        <view class="menu-item logout-item" @tap="logout">
          <text class="menu-icon logout-icon">退</text>
          <text class="menu-text">退出手机号登录</text>
          <text class="menu-arrow">›</text>
        </view>
      </template>
    </view>

    <!-- About section -->
    <view class="about-card">
      <view class="about-header">
        <text class="about-title">关于这顿白吃</text>
      </view>
      <text class="about-desc">这是互动模拟产品，不提供真实支付、接单或配送。</text>
      <view class="about-meta">
        <text class="version">v1.0.0 · 代码版本 {{ CODE_VERSION }}</text>
      </view>
    </view>

    <view class="tab-spacer" />

    <!-- Login Popup -->
    <view :style="showLoginPopup ? '' : 'display:none'" class="overlay">
      <view class="popup" @tap.stop>
        <view class="popup-header">
          <text class="popup-title">{{ isWeb ? '手机号登录' : '完善登录信息' }}</text>
          <text class="popup-close" @tap="closeLogin">✕</text>
        </view>
        <text class="popup-desc">{{ isWeb ? '登录后自动合并当前浏览器的订单和地址。' : '选择微信头像和昵称，登录后会合并游客订单。' }}</text>

        <view v-if="isWeb" class="popup-form phone-form">
          <view class="form-nickname">
            <text class="form-label">手机号</text>
            <input
              v-model="phoneNumber"
              class="nickname-input"
              type="number"
              maxlength="11"
              placeholder="请输入中国大陆手机号"
            />
          </view>
          <view class="form-nickname">
            <text class="form-label">验证码</text>
            <view class="code-row">
              <input
                v-model="phoneCode"
                class="nickname-input code-input"
                type="number"
                maxlength="8"
                placeholder="短信验证码"
              />
              <button
                class="send-code-button"
                :loading="sendingCode"
                :disabled="!!smsCooldown || sendingCode"
                @tap="sendPhoneCode"
              >
                {{ smsCooldown ? `${smsCooldown}s` : '发送验证码' }}
              </button>
            </view>
          </view>
          <text class="phone-note">首次登录会自动创建账号，昵称默认使用手机号。</text>
        </view>

        <view v-else class="popup-form">
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
          <button
            v-if="isWeb"
            class="primary-button confirm-button"
            :loading="loading"
            :disabled="!phoneNumber.trim() || !phoneCode.trim()"
            @tap="loginWithPhone"
          >
            登录
          </button>
          <button
            v-else
            class="primary-button confirm-button"
            :loading="loading"
            :disabled="!avatarUrl || !nickname.trim()"
            @tap="login"
          >
            确认登录
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: #f6f6f6;
  padding: 0;
  padding-bottom: 120rpx;
}

/* Hero section */
.hero {
  background: #ffd400;
  padding: 28rpx 40rpx 50rpx;
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
  color: #171717;
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
  color: #171717;
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
  min-height: 52rpx;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  box-sizing: border-box;
  font-size: 38rpx;
  font-weight: 700;
  color: #171717;
  line-height: 1;
  white-space: nowrap;
}

.stat-label {
  font-size: 24rpx;
  color: rgba(23, 23, 23, 0.72);
  margin-top: 8rpx;
}

/* Guest hero */
.hero.guest {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 36rpx 40rpx 60rpx;
}

.guest-icon {
  width: 120rpx;
  height: 120rpx;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32rpx;
}
.guest-icon image { width: 64rpx; height: 64rpx; }

.guest-title {
  font-size: 40rpx;
  font-weight: 700;
  color: #171717;
  margin-bottom: 16rpx;
}

.guest-desc {
  font-size: 26rpx;
  color: rgba(23, 23, 23, 0.76);
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
  color: #171717;
}

.guest-hint {
  font-size: 24rpx;
  color: rgba(23, 23, 23, 0.62);
}

/* Menu card */
.wallet-card {
  margin: 0 24rpx 24rpx;
  overflow: hidden;
  border-radius: 24rpx;
  background: #171717;
  color: #fff;
  box-shadow: 0 12rpx 28rpx rgba(25, 26, 22, 0.16);
}

.wallet-balance {
  padding: 30rpx 30rpx 24rpx;
}

.wallet-label,
.wallet-note {
  display: block;
  color: rgba(255, 255, 255, 0.62);
  font-size: 23rpx;
}

.wallet-amount-row {
  display: flex;
  align-items: baseline;
  margin: 10rpx 0 12rpx;
}

.wallet-currency {
  margin-right: 8rpx;
  font-size: 28rpx;
  font-weight: 700;
}

.wallet-amount {
  flex: 1;
  font-size: 56rpx;
  font-weight: 800;
  line-height: 1.15;
}

.wallet-arrow {
  color: rgba(255, 255, 255, 0.55);
  font-size: 42rpx;
}

.wallet-actions {
  display: flex;
  gap: 16rpx;
  padding: 20rpx 24rpx;
  background: rgba(255, 255, 255, 0.07);
}

.wallet-action {
  flex: 1;
  height: 72rpx;
  margin: 0;
  border-radius: 36rpx;
  font-size: 25rpx;
  font-weight: 700;
  line-height: 72rpx;
}

.wallet-action::after {
  border: 0;
}

.wallet-action.check-in {
  color: #161714;
  background: #ffd400;
}

.wallet-action.share-reward {
  color: #fff;
  background: #ff7145;
}

.wallet-action[disabled] {
  opacity: 0.55;
}

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
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
  border-radius: 14rpx;
  color: #171717;
  background: #ffd400;
  font-size: 22rpx;
  font-weight: 900;
}
.menu-icon.image-icon { padding: 10rpx; box-sizing: border-box; }

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

.bind-phone-button {
  width: 100%;
  height: auto;
  margin: 0;
  border-radius: 0;
  background: #fff;
  line-height: normal;
  text-align: left;
}

.bind-phone-button::after {
  border: 0;
}

.phone-icon {
  color: #fff;
  background: #259b58;
}

.logout-item .menu-text {
  color: #a23a2c;
}

.logout-icon {
  color: #fff;
  background: #f04426;
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

.phone-form {
  gap: 28rpx;
}

.code-row {
  display: flex;
  gap: 14rpx;
}

.code-input {
  flex: 1;
  min-width: 0;
}

.send-code-button {
  width: 190rpx;
  height: 84rpx;
  margin: 0;
  padding: 0 16rpx;
  border-radius: 16rpx;
  color: #171717;
  background: #ffd400;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 84rpx;
}

.send-code-button::after {
  border: 0;
}

.send-code-button[disabled] {
  color: #999;
  background: #ececec;
}

.phone-note {
  color: #999;
  font-size: 22rpx;
  line-height: 1.5;
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
