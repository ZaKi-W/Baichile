<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCartStore } from '../../stores/cart';
import { useOrderStore } from '../../stores/orders';
import { orderService } from '../../services/orders';
import { useLocationStore } from '../../stores/location';

const cart = useCartStore();
const orders = useOrderStore();
const destination = ref('desk');
const submitting = ref(false);
const location = useLocationStore();
const destinations = [
  { id: 'desk', name: '我的书桌边' }, { id: 'sofa', name: '沙发左侧' },
  { id: 'door', name: '卧室门口' }, { id: 'secret', name: '今晚的秘密基地' },
];
const request = computed(() => ({
  storeId: cart.store?.id || '',
  virtualDestinationId: destination.value,
  virtualDestinationPoint: location.point || undefined,
  lines: cart.lines.map((line) => ({ menuItemId: line.item.id, optionIds: line.optionIds, quantity: line.quantity })),
}));
async function submit() {
  if (!cart.store || !cart.lines.length || submitting.value) return;
  submitting.value = true;
  try {
    const order = await orderService.create(request.value);
    orders.save(order);
    cart.clear();
    uni.redirectTo({ url: `/pages/delivery/index?id=${order.id}` });
  } catch {
    uni.showToast({ title: '虚拟订单创建失败，请重试', icon: 'none' });
  } finally { submitting.value = false; }
}
</script>

<template>
  <view class="page">
    <view class="virtual-notice">本订单仅为互动模拟，不会扣款、不会发货。</view>
    <view v-if="location.point" class="card location-note">将使用已授权的真实当前位置作为虚拟路线终点。<button size="mini" @tap="location.clear">不用当前位置</button></view>
    <view class="card">
      <text class="heading">虚拟收货地点</text>
      <radio-group @change="destination = $event.detail.value">
        <label v-for="item in destinations" :key="item.id" class="destination"><radio :value="item.id" :checked="destination === item.id" /><text>{{ item.name }}</text></label>
      </radio-group>
    </view>
    <view class="card">
      <text class="heading">{{ cart.store?.name }}</text>
      <view v-for="line in cart.lines" :key="line.key" class="line"><view><text>{{ line.item.name }} × {{ line.quantity }}</text><text class="muted">{{ line.optionNames.join('、') }}</text></view><text>¥{{ (line.totalCents / 100).toFixed(2) }}</text></view>
      <view class="line"><text>配送费</text><text>¥{{ ((cart.store?.deliveryFeeCents || 0) / 100).toFixed(2) }}</text></view>
      <view class="line"><text>打包费</text><text>¥{{ ((cart.store?.packingFeeCents || 0) / 100).toFixed(2) }}</text></view>
      <view class="line total"><text>合计</text><text>¥{{ (cart.totalCents / 100).toFixed(2) }}</text></view>
    </view>
    <button class="primary-button" :loading="submitting" :disabled="!cart.lines.length" @tap="submit">确认虚拟下单</button>
  </view>
</template>

<style scoped>
.heading { display: block; font-weight: 700; margin-bottom: 18rpx; }
.destination { display: flex; align-items: center; padding: 14rpx 0; }
.line { display: flex; justify-content: space-between; gap: 16rpx; padding: 14rpx 0; border-bottom: 1rpx solid #eee; }
.line > view { display: flex; flex-direction: column; }
.total { font-weight: 700; border-bottom: 0; }
.virtual-notice { margin-bottom: 20rpx; }
</style>
