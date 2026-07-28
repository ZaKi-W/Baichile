<script setup lang="ts">
import { Box, RefreshRight, WarningFilled } from '@element-plus/icons-vue';

withDefaults(defineProps<{
  error?: string;
  emptyText?: string;
}>(), {
  error: '',
  emptyText: '暂无数据',
});

defineEmits<{
  retry: [];
}>();
</script>

<template>
  <div class="list-feedback" :class="{ 'is-error': error }">
    <el-icon><component :is="error ? WarningFilled : Box" /></el-icon>
    <strong>{{ error ? '数据加载失败' : emptyText }}</strong>
    <span v-if="error">{{ error }}</span>
    <el-button v-if="error" :icon="RefreshRight" @click="$emit('retry')">重试</el-button>
  </div>
</template>
