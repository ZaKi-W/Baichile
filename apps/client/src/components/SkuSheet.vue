<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { MenuItem } from '@baichile/api-contract';
import { validateSelections } from '@baichile/domain';

const props = defineProps<{ item: MenuItem | null }>();
const emit = defineEmits<{ close: []; confirm: [optionIds: string[], quantity: number] }>();
const selected = ref<string[]>([]);
const quantity = ref(1);

watch(() => props.item, (item) => {
  selected.value = item?.specGroups.flatMap((group) => group.options.filter((option) => option.isDefault).map((option) => option.id)) || [];
  quantity.value = 1;
});
const total = computed(() => {
  if (!props.item) return 0;
  const delta = props.item.specGroups.flatMap((group) => group.options)
    .filter((option) => selected.value.includes(option.id)).reduce((sum, option) => sum + option.priceDeltaCents, 0);
  return (props.item.basePriceCents + delta) * quantity.value;
});
function toggle(groupId: string, optionId: string, max: number) {
  if (!props.item) return;
  const group = props.item.specGroups.find((item) => item.id === groupId)!;
  const groupIds = group.options.map((option) => option.id);
  if (selected.value.includes(optionId)) selected.value = selected.value.filter((id) => id !== optionId);
  else if (max === 1) selected.value = [...selected.value.filter((id) => !groupIds.includes(id)), optionId];
  else if (selected.value.filter((id) => groupIds.includes(id)).length < max) selected.value.push(optionId);
}
function confirm() {
  if (!props.item) return;
  const result = validateSelections(props.item.specGroups, selected.value);
  if (!result.valid) return uni.showToast({ title: result.message, icon: 'none' });
  emit('confirm', selected.value, quantity.value);
}
</script>

<template>
  <view v-if="item" class="mask" @tap="$emit('close')">
    <view class="sheet" @tap.stop>
      <text class="title">{{ item.name }}</text>
      <view v-for="group in item.specGroups" :key="group.id" class="group">
        <text>{{ group.name }} <text class="muted">{{ group.required ? '必选' : '可选' }}</text></text>
        <view class="options">
          <button v-for="option in group.options" :key="option.id" size="mini" :class="{ selected: selected.includes(option.id) }" @tap="toggle(group.id, option.id, group.maxSelect)">
            {{ option.name }}<text v-if="option.priceDeltaCents"> +¥{{ (option.priceDeltaCents / 100).toFixed(2) }}</text>
          </button>
        </view>
      </view>
      <view class="footer">
        <view class="quantity"><button size="mini" @tap="quantity = Math.max(1, quantity - 1)">−</button><text>{{ quantity }}</text><button size="mini" @tap="quantity++">＋</button></view>
        <button class="primary-button confirm" @tap="confirm">加入 ¥{{ (total / 100).toFixed(2) }}</button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.mask { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 50; display: flex; align-items: flex-end; }
.sheet { width: 100%; box-sizing: border-box; background: #fff; border-radius: 32rpx 32rpx 0 0; padding: 34rpx 28rpx; padding-bottom: calc(34rpx + env(safe-area-inset-bottom)); }
.title { font-size: 36rpx; font-weight: 900; }
.group { margin-top: 28rpx; }
.options { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 14rpx; }
.options button { margin: 0; border: 1rpx solid #ececec; border-radius: 16rpx; background: #f7f7f7; }
.options button.selected { border-color: #ffd400; background: #ffd400; color: #171717; font-weight: 800; }
.footer { display: flex; align-items: center; margin-top: 32rpx; gap: 20rpx; }
.quantity { display: flex; align-items: center; gap: 12rpx; }
.confirm { flex: 1; }
.confirm::after, .quantity button::after, .options button::after { border: 0; }
</style>
