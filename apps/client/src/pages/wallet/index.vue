<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import type { WalletTransaction } from '@baichile/api-contract';
import { useAuthStore } from '../../stores/auth';
import { useWalletStore } from '../../stores/wallet';

const auth = useAuthStore();
const wallet = useWalletStore();

onShow(async () => {
  await auth.ensureGuest();
  if (!auth.accountId) {
    uni.showToast({ title: '请先登录', icon: 'none' });
    setTimeout(() => uni.switchTab({ url: '/pages/profile/index' }), 350);
    return;
  }
  try {
    await wallet.load(true);
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '钱包加载失败', icon: 'none' });
  }
});

function amountText(transaction: WalletTransaction): string {
  const sign = transaction.amountCents > 0 ? '+' : '-';
  return `${sign}¥${(Math.abs(transaction.amountCents) / 100).toFixed(2)}`;
}

function timeText(value: string): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
</script>

<template>
  <view class="page">
    <view class="balance-panel">
      <text class="balance-label">虚拟余额</text>
      <view class="balance-row">
        <text class="currency">¥</text>
        <text class="balance">{{ (wallet.summary.balanceCents / 100).toFixed(2) }}</text>
      </view>
      <text class="balance-note">仅用于模拟点餐，不可充值、转赠或提现</text>
    </view>

    <view class="history-header">
      <text class="history-title">收支记录</text>
      <text class="history-count">最近 {{ wallet.transactions.length }} 条</text>
    </view>

    <view v-if="wallet.transactions.length" class="transaction-list">
      <view
        v-for="transaction in wallet.transactions"
        :key="transaction.id"
        class="transaction"
      >
        <view class="transaction-icon" :class="{ income: transaction.amountCents > 0 }">
          {{ transaction.amountCents > 0 ? '＋' : '−' }}
        </view>
        <view class="transaction-info">
          <text class="transaction-title">{{ transaction.description }}</text>
          <text class="transaction-time">{{ timeText(transaction.createdAt) }}</text>
        </view>
        <view class="transaction-value">
          <text class="transaction-amount" :class="{ income: transaction.amountCents > 0 }">
            {{ amountText(transaction) }}
          </text>
          <text class="transaction-balance">余额 ¥{{ (transaction.balanceAfterCents / 100).toFixed(2) }}</text>
        </view>
      </view>
    </view>

    <view v-else-if="!wallet.loading" class="empty">
      <text class="empty-mark">¥</text>
      <text class="empty-title">暂无收支记录</text>
      <text class="empty-note">签到或下单后，记录会出现在这里</text>
    </view>
  </view>
</template>

<style scoped>
.page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 24rpx 24rpx calc(60rpx + env(safe-area-inset-bottom));
  background: #f6f6f6;
}

.balance-panel {
  padding: 38rpx 34rpx 34rpx;
  border-radius: 28rpx;
  color: #171717;
  background: #ffd400;
  box-shadow: 0 14rpx 32rpx rgba(25, 26, 22, 0.16);
}

.balance-label,
.balance-note {
  display: block;
  color: rgba(23, 23, 23, 0.62);
  font-size: 24rpx;
}

.balance-row {
  display: flex;
  align-items: baseline;
  margin: 18rpx 0;
}

.currency {
  margin-right: 10rpx;
  font-size: 32rpx;
  font-weight: 700;
}

.balance {
  font-size: 68rpx;
  font-weight: 850;
  line-height: 1;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 38rpx 8rpx 18rpx;
}

.history-title {
  color: #181914;
  font-size: 32rpx;
  font-weight: 800;
}

.history-count {
  color: #999;
  font-size: 23rpx;
}

.transaction-list {
  overflow: hidden;
  border-radius: 22rpx;
  background: #fff;
}

.transaction {
  display: flex;
  align-items: center;
  gap: 20rpx;
  min-height: 112rpx;
  margin-left: 24rpx;
  padding: 18rpx 24rpx 18rpx 0;
  border-bottom: 1rpx solid #efefec;
}

.transaction:last-child {
  border-bottom: 0;
}

.transaction-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  flex-shrink: 0;
  border-radius: 20rpx;
  color: #755348;
  background: #f6ece8;
  font-size: 32rpx;
  font-weight: 700;
}

.transaction-icon.income {
  color: #647424;
  background: #eff5d4;
}

.transaction-info {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 8rpx;
}

.transaction-title {
  overflow: hidden;
  color: #262721;
  font-size: 27rpx;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transaction-time,
.transaction-balance {
  color: #aaa;
  font-size: 21rpx;
}

.transaction-value {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  gap: 7rpx;
}

.transaction-amount {
  color: #262721;
  font-size: 28rpx;
  font-weight: 750;
}

.transaction-amount.income {
  color: #718522;
}

.empty {
  display: flex;
  align-items: center;
  flex-direction: column;
  padding: 100rpx 30rpx;
  color: #999;
}

.empty-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  margin-bottom: 24rpx;
  border-radius: 50%;
  color: #9a9c91;
  background: #e9eae5;
  font-size: 36rpx;
  font-weight: 700;
}

.empty-title {
  color: #666;
  font-size: 28rpx;
  font-weight: 650;
}

.empty-note {
  margin-top: 10rpx;
  font-size: 23rpx;
}
</style>
