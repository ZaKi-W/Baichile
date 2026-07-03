<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import { adminApi } from '../api/admin';
import { formatDate } from '../utils';
const loading=ref(false),items=ref<Record<string,any>[]>([]),total=ref(0),detail=ref<Record<string,any>|null>(null);
const filters=reactive({page:1,pageSize:20,action:'',resourceType:'',accountId:''});
async function load(){loading.value=true;try{const r=await adminApi.auditLogs(filters);items.value=r.items;total.value=r.total;}catch(e){ElMessage.error(e instanceof Error?e.message:'审计日志加载失败');}finally{loading.value=false;}}
onMounted(load);
</script>
<template>
  <div class="page-toolbar"><el-input v-model="filters.action" class="filter-input" clearable placeholder="操作，如 wallet.adjust" :prefix-icon="Search" @keyup.enter="load"/><el-input v-model="filters.resourceType" clearable placeholder="资源类型" style="width:160px"/><el-input v-model="filters.accountId" clearable placeholder="管理员 ID" style="width:200px"/><el-button @click="filters.page=1;load()">查询</el-button><span class="grow"/></div>
  <div class="surface data-surface"><el-table v-loading="loading" :data="items"><el-table-column prop="action" label="操作" min-width="170"/><el-table-column prop="resourceType" label="资源" width="140"/><el-table-column prop="resourceId" label="资源 ID" min-width="190"/><el-table-column prop="adminUserId" label="管理员 ID" min-width="190"/><el-table-column prop="ipAddress" label="IP" width="130"/><el-table-column label="时间" width="180"><template #default="{row}">{{formatDate(row.createdAt)}}</template></el-table-column><el-table-column label="详情" width="80"><template #default="{row}"><el-button link type="primary" @click="detail=row">查看</el-button></template></el-table-column></el-table><div class="pagination"><el-pagination v-model:current-page="filters.page" :page-size="filters.pageSize" layout="total, prev, pager, next" :total="total" @current-change="load"/></div></div>
  <el-drawer v-model="detail" title="审计详情" size="520px"><template v-if="detail"><div class="detail-item"><span>操作</span><strong>{{detail.action}}</strong></div><div class="detail-item"><span>资源</span><strong>{{detail.resourceType}} / {{detail.resourceId||'—'}}</strong></div><div class="section-title"><h2>变更前</h2></div><pre class="json-view">{{JSON.stringify(detail.beforeData,null,2)}}</pre><div class="section-title"><h2>变更后</h2></div><pre class="json-view">{{JSON.stringify(detail.afterData,null,2)}}</pre></template></el-drawer>
</template>
