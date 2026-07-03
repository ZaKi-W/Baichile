<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import { adminApi, type OrderRecord } from '../api/admin';
import { centsToYuan, formatDate } from '../utils';
const router=useRouter(),loading=ref(false),items=ref<OrderRecord[]>([]),total=ref(0);
const filters=reactive({page:1,pageSize:20,keyword:'',storeId:'',adminStatus:'',status:''});
async function load(){loading.value=true;try{const r=await adminApi.listOrders(filters);items.value=r.items;total.value=r.total;}catch(e){ElMessage.error(e instanceof Error?e.message:'订单加载失败');}finally{loading.value=false;}}
function openRow(row: OrderRecord){router.push(`/orders/${row.id}`);}
onMounted(load);
</script>
<template>
  <div class="page-toolbar"><el-input v-model="filters.keyword" class="filter-input" clearable placeholder="订单号或用户 ID" :prefix-icon="Search" @keyup.enter="filters.page=1;load()"/><el-input v-model="filters.storeId" clearable placeholder="商家 ID" style="width:170px"/><el-select v-model="filters.adminStatus" clearable placeholder="跟进状态" style="width:140px"><el-option label="正常" value="normal"/><el-option label="跟进中" value="following_up"/><el-option label="已解决" value="resolved"/></el-select><el-button @click="filters.page=1;load()">查询</el-button><span class="grow"/></div>
  <div class="surface data-surface"><el-table v-loading="loading" :data="items" @row-click="openRow"><el-table-column prop="id" label="订单号" min-width="250"/><el-table-column prop="accountId" label="用户" min-width="180"/><el-table-column prop="storeId" label="商家" min-width="150"/><el-table-column label="金额" width="110"><template #default="{row}">¥{{centsToYuan(row.totalCents)}}</template></el-table-column><el-table-column prop="status" label="配送状态" width="120"/><el-table-column label="跟进状态" width="110"><template #default="{row}"><el-tag :type="row.adminStatus==='resolved'?'success':row.adminStatus==='following_up'?'warning':'info'" effect="plain">{{({normal:'正常',following_up:'跟进中',resolved:'已解决'} as any)[row.adminStatus]}}</el-tag></template></el-table-column><el-table-column label="创建时间" width="180"><template #default="{row}">{{formatDate(row.createdAt)}}</template></el-table-column><el-table-column label="操作" width="80"><template #default="{row}"><el-button link type="primary" @click.stop="router.push(`/orders/${row.id}`)">详情</el-button></template></el-table-column></el-table><div class="pagination"><el-pagination v-model:current-page="filters.page" :page-size="filters.pageSize" layout="total, prev, pager, next" :total="total" @current-change="load"/></div></div>
</template>
