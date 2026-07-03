<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { adminApi, type OrderRecord } from '../api/admin';
import { centsToYuan, formatDate } from '../utils';
import { useAuthStore } from '../stores/auth';
const route=useRoute(),auth=useAuthStore(),loading=ref(false),order=ref<(OrderRecord&{account?:any;store?:any})|null>(null),editOpen=ref(false);
const edit=reactive({adminStatus:'normal' as OrderRecord['adminStatus'],adminNote:''});
async function load(){loading.value=true;try{order.value=await adminApi.order(String(route.params.id));}catch(e){ElMessage.error(e instanceof Error?e.message:'订单加载失败');}finally{loading.value=false;}}
function openEdit(){if(!order.value)return;edit.adminStatus=order.value.adminStatus;edit.adminNote=order.value.adminNote;editOpen.value=true;}
async function save(){await adminApi.updateOrder(String(route.params.id),edit);ElMessage.success('订单跟进信息已保存');editOpen.value=false;await load();}
onMounted(load);
</script>
<template>
  <div v-loading="loading"><div class="page-toolbar"><el-button @click="$router.back()">返回</el-button><span class="grow"/><el-button v-if="auth.has('orders:write')" type="primary" @click="openEdit">更新跟进状态</el-button></div>
    <template v-if="order"><div class="surface detail-grid"><div class="detail-item"><span>订单号</span><strong>{{order.id}}</strong></div><div class="detail-item"><span>用户</span><strong>{{order.account?.nickname||order.accountId||'游客'}}</strong></div><div class="detail-item"><span>商家</span><strong>{{order.store?.name||order.storeId}}</strong></div><div class="detail-item"><span>订单金额</span><strong>¥{{centsToYuan(order.totalCents)}}</strong></div><div class="detail-item"><span>配送状态</span><strong>{{order.status}}</strong></div><div class="detail-item"><span>后台状态</span><strong>{{order.adminStatus}}</strong></div><div class="detail-item"><span>创建时间</span><strong>{{formatDate(order.createdAt)}}</strong></div><div class="detail-item"><span>异常</span><strong>{{order.incidentKey||'无'}}</strong></div><div class="detail-item"><span>退款</span><strong>{{order.refundedAt?formatDate(order.refundedAt):'无'}}</strong></div></div>
    <div class="section-title"><h2>商品快照</h2><span>订单历史数据不可修改</span></div><pre class="json-view">{{JSON.stringify(order.lines,null,2)}}</pre><div class="section-title"><h2>内部备注</h2></div><div class="surface" style="padding:18px">{{order.adminNote||'暂无内部备注'}}</div></template>
  </div>
  <el-dialog v-model="editOpen" title="订单跟进" width="520px"><el-form label-position="top"><el-form-item label="管理状态"><el-select v-model="edit.adminStatus" style="width:100%"><el-option label="正常" value="normal"/><el-option label="跟进中" value="following_up"/><el-option label="已解决" value="resolved"/></el-select></el-form-item><el-form-item label="内部备注"><el-input v-model="edit.adminNote" type="textarea" :rows="5" maxlength="1000" show-word-limit/></el-form-item></el-form><template #footer><el-button @click="editOpen=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template></el-dialog>
</template>
