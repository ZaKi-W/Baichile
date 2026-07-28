<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Search } from '@element-plus/icons-vue';
import ListFeedback from '../components/ListFeedback.vue';
import { adminApi, type AccountRecord } from '../api/admin';
import { centsToYuan, formatDate } from '../utils';

const router = useRouter();
const loading = ref(false), error = ref(''), items = ref<AccountRecord[]>([]), total = ref(0);
const filters = reactive({ page: 1, pageSize: 20, keyword: '', status: '' });
async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await adminApi.listAccounts(filters);
    items.value = result.items;
    total.value = result.total;
  } catch (reason) {
    items.value = [];
    total.value = 0;
    error.value = reason instanceof Error ? reason.message : '用户加载失败';
  } finally {
    loading.value = false;
  }
}
function search() { filters.page = 1; void load(); }
function openRow(row: AccountRecord) { router.push(`/accounts/${row.id}`); }
function statusLabel(status: AccountRecord['status']): string {
  return { active: '正常', disabled: '禁用', deleted: '已注销' }[status];
}
function statusType(status: AccountRecord['status']): 'success' | 'danger' | 'info' {
  if (status === 'active') return 'success';
  return status === 'disabled' ? 'danger' : 'info';
}
onMounted(load);
</script>

<template>
  <div class="page-toolbar">
    <el-input v-model="filters.keyword" class="filter-input" clearable placeholder="搜索用户 ID 或昵称" :prefix-icon="Search" @keyup.enter="search" />
    <el-select v-model="filters.status" clearable placeholder="全部状态" style="width:140px" @change="search"><el-option label="正常" value="active" /><el-option label="禁用" value="disabled" /></el-select>
    <el-button @click="search">查询</el-button><span class="grow" />
  </div>
  <div class="surface data-surface">
    <el-table v-loading="loading" :data="items" @row-click="openRow">
      <el-table-column prop="id" label="用户 ID" min-width="220" />
      <el-table-column prop="nickname" label="昵称" width="150"><template #default="{ row }">{{ row.nickname || '未设置' }}</template></el-table-column>
      <el-table-column label="虚拟余额" width="150"><template #default="{ row }">虚拟 ¥{{ centsToYuan(row.balanceCents) }}</template></el-table-column>
      <el-table-column label="注册时间" width="180"><template #default="{ row }">{{ formatDate(row.createdAt) }}</template></el-table-column>
      <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="statusType(row.status)" effect="plain">{{ statusLabel(row.status) }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="90"><template #default="{ row }"><el-button link type="primary" @click.stop="router.push(`/accounts/${row.id}`)">详情</el-button></template></el-table-column>
      <template #empty><ListFeedback :error="error" empty-text="暂无符合条件的用户" @retry="load" /></template>
    </el-table>
    <div class="pagination"><el-pagination v-model:current-page="filters.page" v-model:page-size="filters.pageSize" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" :total="total" @current-change="load" @size-change="search" /></div>
  </div>
</template>
