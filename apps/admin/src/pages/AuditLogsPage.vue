<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Search } from '@element-plus/icons-vue';
import ListFeedback from '../components/ListFeedback.vue';
import { adminApi, type AuditLogRecord } from '../api/admin';
import {
  formatDate,
  maskIpAddress,
  redactAuditValue,
} from '../utils';

const loading = ref(false);
const error = ref('');
const items = ref<AuditLogRecord[]>([]);
const total = ref(0);
const detail = ref<AuditLogRecord | null>(null);
const filters = reactive({
  page: 1,
  pageSize: 20,
  action: '',
  resourceType: '',
  accountId: '',
});
const redactedBefore = computed(() => redactAuditValue(detail.value?.beforeData));
const redactedAfter = computed(() => redactAuditValue(detail.value?.afterData));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await adminApi.auditLogs(filters);
    items.value = result.items;
    total.value = result.total;
  } catch (reason) {
    items.value = [];
    total.value = 0;
    error.value = reason instanceof Error ? reason.message : '审计日志加载失败';
  } finally {
    loading.value = false;
  }
}

function search() {
  filters.page = 1;
  void load();
}

onMounted(load);
</script>

<template>
  <el-alert
    class="audit-privacy-note"
    type="info"
    title="审计详情默认隐藏手机号、地址、令牌、密码摘要等敏感字段。"
    :closable="false"
    show-icon
  />
  <div class="page-toolbar">
    <el-input
      v-model="filters.action"
      class="filter-input"
      clearable
      placeholder="操作，如 wallet.adjust"
      :prefix-icon="Search"
      @keyup.enter="search"
    />
    <el-input v-model="filters.resourceType" clearable placeholder="资源类型" style="width: 160px" @keyup.enter="search" />
    <el-input v-model="filters.accountId" clearable placeholder="管理员 ID" style="width: 200px" @keyup.enter="search" />
    <el-button @click="search">查询</el-button>
    <span class="grow" />
  </div>
  <div class="surface data-surface">
    <el-table v-loading="loading" :data="items">
      <el-table-column prop="action" label="操作" min-width="170" />
      <el-table-column prop="resourceType" label="资源" width="140" />
      <el-table-column prop="resourceId" label="资源 ID" min-width="190" />
      <el-table-column prop="adminUserId" label="管理员 ID" min-width="190" />
      <el-table-column label="IP（脱敏）" width="130">
        <template #default="{ row }">{{ maskIpAddress(row.ipAddress) }}</template>
      </el-table-column>
      <el-table-column label="时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="详情" width="80">
        <template #default="{ row }"><el-button link type="primary" @click="detail = row">查看</el-button></template>
      </el-table-column>
      <template #empty>
        <ListFeedback :error="error" empty-text="暂无符合条件的审计记录" @retry="load" />
      </template>
    </el-table>
    <div class="pagination">
      <el-pagination
        v-model:current-page="filters.page"
        v-model:page-size="filters.pageSize"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        :total="total"
        @current-change="load"
        @size-change="search"
      />
    </div>
  </div>
  <el-drawer v-model="detail" title="审计详情（已脱敏）" size="520px">
    <template v-if="detail">
      <div class="detail-item"><span>操作</span><strong>{{ detail.action }}</strong></div>
      <div class="detail-item"><span>资源</span><strong>{{ detail.resourceType }} / {{ detail.resourceId || '—' }}</strong></div>
      <div class="section-title"><h2>变更前</h2></div>
      <pre class="json-view">{{ JSON.stringify(redactedBefore, null, 2) }}</pre>
      <div class="section-title"><h2>变更后</h2></div>
      <pre class="json-view">{{ JSON.stringify(redactedAfter, null, 2) }}</pre>
    </template>
  </el-drawer>
</template>
