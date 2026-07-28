<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RefreshRight } from '@element-plus/icons-vue';
import {
  adminApi,
  type AdminDashboardData,
  type DashboardProductMetrics,
} from '../api/admin';
import { centsToYuan } from '../utils';

interface MetricDefinition {
  key: keyof DashboardProductMetrics;
  label: string;
  description: string;
}

const loading = ref(false);
const error = ref('');
const data = ref<AdminDashboardData | null>(null);

const outcomeMetrics: MetricDefinition[] = [
  { key: 'firstCheckoutCompletionRate', label: '首结算完成率', description: '首次进入 checkout 并完成虚拟结算' },
  { key: 'guestToLoginRate', label: '游客转登录率', description: '游客后续完成账号登录' },
  { key: 'd1ReorderRate', label: 'D1 复购', description: '首单次日再次完成虚拟订单' },
  { key: 'd7ReorderRate', label: 'D7 复购', description: '首单七日内再次完成虚拟订单' },
  { key: 'promotionConversionRate', label: '促销转化', description: '促销曝光后完成虚拟结算' },
];
const guardrailMetrics: MetricDefinition[] = [
  { key: 'deliveryFailureRate', label: '配送失败率', description: '虚拟配送进入失败状态' },
  { key: 'rewardAnomalyRate', label: '奖励异常率', description: '奖励流水被识别为异常' },
];

const metrics = computed(() => data.value?.productMetrics ?? {});

function formatRate(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function metricState(value?: number | null): string {
  return value === null || value === undefined ? '等待埋点数据' : '近期开启统计';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await adminApi.dashboard();
  } catch (reason) {
    data.value = null;
    error.value = reason instanceof Error ? reason.message : '概览加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <el-alert v-if="error" class="page-error" type="error" :title="error" show-icon :closable="false">
    <template #default>
      <el-button link type="danger" :icon="RefreshRight" @click="load">重试</el-button>
    </template>
  </el-alert>

  <div v-loading="loading">
    <template v-if="data">
      <section class="dashboard-heading">
        <div>
          <p class="eyebrow">PRODUCT OUTCOMES</p>
          <h2>增长与体验结果</h2>
          <span>所有订单与金额指标均为应用内虚拟业务口径。</span>
        </div>
        <el-button :icon="RefreshRight" @click="load">刷新数据</el-button>
      </section>

      <div class="outcome-metric-grid">
        <article v-for="metric in outcomeMetrics" :key="metric.key" class="surface outcome-metric">
          <span>{{ metric.label }}</span>
          <strong>{{ formatRate(metrics[metric.key]) }}</strong>
          <p>{{ metric.description }}</p>
          <small>{{ metricState(metrics[metric.key]) }}</small>
        </article>
      </div>

      <div class="section-title">
        <div><h2>质量护栏</h2><span>增长指标提升时需同步观察风险是否恶化。</span></div>
      </div>
      <div class="guardrail-grid">
        <article v-for="metric in guardrailMetrics" :key="metric.key" class="surface guardrail-metric">
          <div>
            <span>{{ metric.label }}</span>
            <p>{{ metric.description }}</p>
          </div>
          <strong>{{ formatRate(metrics[metric.key]) }}</strong>
        </article>
      </div>

      <div class="section-title">
        <div><h2>运营规模</h2><span>存量、今日增量与虚拟资金规模。</span></div>
      </div>
      <div class="metric-grid">
        <div class="metric surface"><span class="metric-label">商家</span><strong>{{ data.stores.total }}</strong><small>{{ data.stores.active }} 家上架</small></div>
        <div class="metric surface"><span class="metric-label">菜品</span><strong>{{ data.menuItems.total }}</strong><small>{{ data.menuItems.active }} 个上架</small></div>
        <div class="metric surface"><span class="metric-label">用户</span><strong>{{ data.accounts.total }}</strong><small>今日新增 {{ data.accounts.today }}</small></div>
        <div class="metric surface"><span class="metric-label">虚拟订单</span><strong>{{ data.orders.total }}</strong><small>今日新增 {{ data.orders.today }}</small></div>
        <div class="metric surface"><span class="metric-label">用户虚拟资金总余额</span><strong>虚拟 ¥{{ centsToYuan(data.wallet.totalBalanceCents) }}</strong><small>今日净变动 虚拟 ¥{{ centsToYuan(data.wallet.todayNetCents) }}</small></div>
      </div>

      <div class="section-title"><h2>虚拟订单跟进状态</h2><span>按后台管理状态统计</span></div>
      <div class="surface detail-grid">
        <div class="detail-item"><span>正常</span><strong>{{ data.orders.byAdminStatus.normal || 0 }}</strong></div>
        <div class="detail-item"><span>跟进中</span><strong>{{ data.orders.byAdminStatus.following_up || 0 }}</strong></div>
        <div class="detail-item"><span>已解决</span><strong>{{ data.orders.byAdminStatus.resolved || 0 }}</strong></div>
      </div>
    </template>
  </div>
</template>
