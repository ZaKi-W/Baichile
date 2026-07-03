<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import { adminApi, type AccountRecord } from '../api/admin';
import { centsToYuan, formatDate } from '../utils';

const router = useRouter();
const loading = ref(false), items = ref<AccountRecord[]>([]), total = ref(0);
const filters = reactive({ page: 1, pageSize: 20, keyword: '', status: '' });
async function load() { loading.value=true; try { const r=await adminApi.listAccounts(filters); items.value=r.items; total.value=r.total; } catch(e){ ElMessage.error(e instanceof Error?e.message:'用户加载失败'); } finally { loading.value=false; } }
function openRow(row: AccountRecord) { router.push(`/accounts/${row.id}`); }
onMounted(load);
</script>

<template>
  <div class="page-toolbar">
    <el-input v-model="filters.keyword" class="filter-input" clearable placeholder="搜索用户 ID 或昵称" :prefix-icon="Search" @keyup.enter="filters.page=1;load()" />
    <el-select v-model="filters.status" clearable placeholder="全部状态" style="width:140px" @change="filters.page=1;load()"><el-option label="正常" value="active" /><el-option label="禁用" value="disabled" /></el-select>
    <el-button @click="filters.page=1;load()">查询</el-button><span class="grow" />
  </div>
  <div class="surface data-surface">
    <el-table v-loading="loading" :data="items" @row-click="openRow">
      <el-table-column prop="id" label="用户 ID" min-width="220" />
      <el-table-column prop="nickname" label="昵称" width="150"><template #default="{ row }">{{ row.nickname || '未设置' }}</template></el-table-column>
      <el-table-column label="余额" width="130"><template #default="{ row }">¥{{ centsToYuan(row.balanceCents) }}</template></el-table-column>
      <el-table-column label="注册时间" width="180"><template #default="{ row }">{{ formatDate(row.createdAt) }}</template></el-table-column>
      <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status==='active'?'success':'danger'" effect="plain">{{ row.status==='active'?'正常':'禁用' }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="90"><template #default="{ row }"><el-button link type="primary" @click.stop="router.push(`/accounts/${row.id}`)">详情</el-button></template></el-table-column>
    </el-table>
    <div class="pagination"><el-pagination v-model:current-page="filters.page" :page-size="filters.pageSize" layout="total, prev, pager, next" :total="total" @current-change="load" /></div>
  </div>
</template>
