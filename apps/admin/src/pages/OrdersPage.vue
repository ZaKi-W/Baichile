<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Search } from '@element-plus/icons-vue';
import ListFeedback from '../components/ListFeedback.vue';
import { adminApi, type OrderRecord } from '../api/admin';
import { centsToYuan, formatDate } from '../utils';
const router=useRouter(),loading=ref(false),error=ref(''),items=ref<OrderRecord[]>([]),total=ref(0);
const filters=reactive({page:1,pageSize:20,keyword:'',storeId:'',adminStatus:'',status:''});
const adminStatusLabels: Record<OrderRecord['adminStatus'], string> = {
  normal: '正常',
  following_up: '跟进中',
  resolved: '已解决',
};
function adminStatusLabel(status: OrderRecord['adminStatus']): string {
  return adminStatusLabels[status];
}
async function load(){
  loading.value=true;
  error.value='';
  try{
    const result=await adminApi.listOrders(filters);
    items.value=result.items;
    total.value=result.total;
  }catch(reason){
    items.value=[];
    total.value=0;
    error.value=reason instanceof Error?reason.message:'订单加载失败';
  }finally{loading.value=false;}
}
function search(){filters.page=1;void load();}
function openRow(row: OrderRecord){router.push(`/orders/${row.id}`);}
onMounted(load);
</script>
<template>
  <div class="page-toolbar"><el-input v-model="filters.keyword" class="filter-input" clearable placeholder="订单号或用户 ID" :prefix-icon="Search" @keyup.enter="search"/><el-input v-model="filters.storeId" clearable placeholder="商家 ID" style="width:170px" @keyup.enter="search"/><el-select v-model="filters.adminStatus" clearable placeholder="跟进状态" style="width:140px" @change="search"><el-option label="正常" value="normal"/><el-option label="跟进中" value="following_up"/><el-option label="已解决" value="resolved"/></el-select><el-button @click="search">查询</el-button><span class="grow"/></div>
  <div class="surface data-surface"><el-table v-loading="loading" :data="items" @row-click="openRow"><el-table-column prop="id" label="订单号" min-width="250"/><el-table-column prop="accountId" label="用户" min-width="180"/><el-table-column prop="storeId" label="商家" min-width="150"/><el-table-column label="虚拟金额" width="140"><template #default="{row}">虚拟 ¥{{centsToYuan(row.totalCents)}}</template></el-table-column><el-table-column prop="status" label="配送状态" width="120"/><el-table-column label="跟进状态" width="110"><template #default="{row}"><el-tag :type="row.adminStatus==='resolved'?'success':row.adminStatus==='following_up'?'warning':'info'" effect="plain">{{adminStatusLabel(row.adminStatus)}}</el-tag></template></el-table-column><el-table-column label="创建时间" width="180"><template #default="{row}">{{formatDate(row.createdAt)}}</template></el-table-column><el-table-column label="操作" width="80"><template #default="{row}"><el-button link type="primary" @click.stop="router.push(`/orders/${row.id}`)">详情</el-button></template></el-table-column><template #empty><ListFeedback :error="error" empty-text="暂无符合条件的虚拟订单" @retry="load"/></template></el-table><div class="pagination"><el-pagination v-model:current-page="filters.page" v-model:page-size="filters.pageSize" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" :total="total" @current-change="load" @size-change="search"/></div></div>
</template>
