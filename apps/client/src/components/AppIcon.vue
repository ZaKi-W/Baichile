<script setup lang="ts">
import { computed } from 'vue';
import { ICON_REGISTRY, type IconKey } from '@baichile/icon-registry';

const props = withDefaults(defineProps<{ name: IconKey; size?: number; showLabel?: boolean }>(), {
  size: 20,
  showLabel: false,
});
const icon = computed(() => ICON_REGISTRY[props.name]);
</script>

<template>
  <view class="app-icon" :aria-label="icon.label">
    <image v-if="icon.assetPath" :src="icon.assetPath" :style="{ width: `${size}px`, height: `${size}px` }" mode="aspectFit" />
    <text v-else :style="{ fontSize: `${size}px`, lineHeight: `${size + 4}px` }">{{ icon.emoji }}</text>
    <text v-if="showLabel" class="label">{{ icon.label }}</text>
  </view>
</template>

<style scoped>
.app-icon { display: inline-flex; align-items: center; justify-content: center; flex-direction: column; }
.label { margin-top: 4rpx; font-size: 20rpx; }
</style>

