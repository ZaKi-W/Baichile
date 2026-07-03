<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { adminApi } from '../api/admin';
import { centsToYuan } from '../utils';

const loading = ref(true);
const data = ref<any>(null);

onMounted(async () => {
  try { data.value = await adminApi.dashboard(); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '概览加载失败'); }
  finally { loading.value = false; }
});
</script>

<template>
  <div v-loading="loading">
    <div v-if="data" class="metric-grid">
      <div class="metric surface"><span class="metric-label">商家</span><strong>{{ data.stores.total }}</strong><small>{{ data.stores.active }} 家上架</small></div>
      <div class="metric surface"><span class="metric-label">菜品</span><strong>{{ data.menuItems.total }}</strong><small>{{ data.menuItems.active }} 个上架</small></div>
      <div class="metric surface"><span class="metric-label">用户</span><strong>{{ data.accounts.total }}</strong><small>今日新增 {{ data.accounts.today }}</small></div>
      <div class="metric surface"><span class="metric-label">订单</span><strong>{{ data.orders.total }}</strong><small>今日新增 {{ data.orders.today }}</small></div>
      <div class="metric surface"><span class="metric-label">用户货币总余额</span><strong>¥{{ centsToYuan(data.wallet.totalBalanceCents) }}</strong><small>今日净变动 ¥{{ centsToYuan(data.wallet.todayNetCents) }}</small></div>
    </div>
    <div v-if="data" class="section-title"><h2>订单跟进状态</h2><span>按后台管理状态统计</span></div>
    <div v-if="data" class="surface detail-grid">
      <div class="detail-item"><span>正常</span><strong>{{ data.orders.byAdminStatus.normal || 0 }}</strong></div>
      <div class="detail-item"><span>跟进中</span><strong>{{ data.orders.byAdminStatus.following_up || 0 }}</strong></div>
      <div class="detail-item"><span>已解决</span><strong>{{ data.orders.byAdminStatus.resolved || 0 }}</strong></div>
    </div>
  </div>
</template>
