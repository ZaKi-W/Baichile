<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import ListFeedback from '../components/ListFeedback.vue';
import { adminApi, type AccountRecord, type WalletTransactionRecord } from '../api/admin';
import { centsToYuan, formatDate, yuanToCents } from '../utils';
import { useAuthStore } from '../stores/auth';

const route=useRoute(), auth=useAuthStore(), id=String(route.params.id);
const loading=ref(false), error=ref(''), account=ref<AccountRecord|null>(null), transactions=ref<WalletTransactionRecord[]>([]), total=ref(0);
const walletQuery=reactive({page:1,pageSize:20,type:''});
const editOpen=ref(false), adjustOpen=ref(false);
const edit=reactive({nickname:'',status:'active' as 'active'|'disabled'});
const adjustment=reactive({amountYuan:0,reason:''});
const nextBalance=computed(()=> (account.value?.balanceCents ?? 0)+yuanToCents(adjustment.amountYuan));
async function load(){loading.value=true;error.value='';try{const r=await adminApi.wallet(id,walletQuery);account.value=r.account;transactions.value=r.transactions.items;total.value=r.transactions.total;}catch(e){transactions.value=[];total.value=0;error.value=e instanceof Error?e.message:'用户信息加载失败';}finally{loading.value=false;}}
function accountStatusLabel(status: AccountRecord['status']): string {
  return { active: '正常', disabled: '禁用', deleted: '已注销' }[status];
}
function openEdit(){
  if(!account.value || account.value.status === 'deleted')return;
  edit.nickname=account.value.nickname??'';
  edit.status=account.value.status;
  editOpen.value=true;
}
async function saveAccount(){await adminApi.updateAccount(id,edit);ElMessage.success('用户资料已保存');editOpen.value=false;await load();}
async function adjust(){const cents=yuanToCents(adjustment.amountYuan);await ElMessageBox.confirm(`确认调整 ${cents>0?'+':''}虚拟 ¥${centsToYuan(cents)}，调整后虚拟余额 ¥${centsToYuan(nextBalance.value)}？`,'虚拟资金调整确认',{type:'warning'});await adminApi.adjustWallet(id,cents,adjustment.reason);ElMessage.success('虚拟余额调整已记入流水');adjustOpen.value=false;adjustment.amountYuan=0;adjustment.reason='';await load();}
onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <div class="page-toolbar"><el-button @click="$router.back()">返回</el-button><span class="grow" /><el-tag v-if="account?.status === 'deleted'" type="info" effect="plain">已注销 · 只读</el-tag><el-button v-if="auth.has('accounts:write') && account?.status !== 'deleted'" @click="openEdit">编辑用户</el-button><el-button v-if="auth.has('wallet:adjust') && account?.status !== 'deleted'" type="primary" @click="adjustOpen=true">调整虚拟余额</el-button></div>
    <div v-if="account" class="surface detail-grid">
      <div class="detail-item"><span>用户 ID</span><strong>{{ account.id }}</strong></div>
      <div class="detail-item"><span>昵称</span><strong>{{ account.nickname||'未设置' }}</strong></div>
      <div class="detail-item"><span>账号状态</span><strong>{{ accountStatusLabel(account.status) }}</strong></div>
      <div class="detail-item"><span>当前虚拟余额</span><strong>虚拟 ¥{{ centsToYuan(account.balanceCents) }}</strong></div>
      <div class="detail-item"><span>订单数</span><strong>{{ account.orderCount??0 }}</strong></div>
      <div class="detail-item"><span>注册时间</span><strong>{{ formatDate(account.createdAt) }}</strong></div>
    </div>
    <div class="section-title"><h2>虚拟资金流水</h2><el-select v-model="walletQuery.type" clearable placeholder="全部类型" style="width:180px" @change="walletQuery.page=1;load()"><el-option label="后台调整" value="admin_adjustment"/><el-option label="初始虚拟资金" value="initial_grant"/><el-option label="签到" value="daily_checkin"/><el-option label="虚拟订单支付" value="order_payment"/><el-option label="虚拟订单退款" value="order_refund"/></el-select></div>
    <div class="surface data-surface">
      <el-table :data="transactions"><el-table-column prop="type" label="类型" width="150"/><el-table-column label="虚拟变动" width="150"><template #default="{row}"><strong :class="row.amountCents>=0?'amount-positive':'amount-negative'">{{row.amountCents>=0?'+':''}}虚拟 ¥{{centsToYuan(row.amountCents)}}</strong></template></el-table-column><el-table-column label="变动后虚拟余额" width="170"><template #default="{row}">虚拟 ¥{{centsToYuan(row.balanceAfterCents)}}</template></el-table-column><el-table-column prop="description" label="说明" min-width="220"/><el-table-column label="时间" width="180"><template #default="{row}">{{formatDate(row.createdAt)}}</template></el-table-column><template #empty><ListFeedback :error="error" empty-text="暂无虚拟资金流水" @retry="load"/></template></el-table>
      <div class="pagination"><el-pagination v-model:current-page="walletQuery.page" v-model:page-size="walletQuery.pageSize" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" :total="total" @current-change="load" @size-change="walletQuery.page=1;load()"/></div>
    </div>
  </div>
  <el-dialog v-model="editOpen" title="编辑用户" width="460px"><el-form label-position="top"><el-form-item label="昵称"><el-input v-model="edit.nickname"/></el-form-item><el-form-item label="账号状态"><el-select v-model="edit.status" style="width:100%"><el-option label="正常" value="active"/><el-option label="禁用" value="disabled"/></el-select></el-form-item></el-form><template #footer><el-button @click="editOpen=false">取消</el-button><el-button type="primary" @click="saveAccount">保存</el-button></template></el-dialog>
  <el-dialog v-model="adjustOpen" title="调整用户虚拟余额" width="480px"><el-alert type="warning" :closable="false" show-icon title="应用内虚拟资金不可充值或提现；此操作会生成不可修改的虚拟资金流水和审计记录"/><el-form label-position="top" style="margin-top:18px"><el-form-item label="调整虚拟金额（元，扣减请输入负数）"><el-input-number v-model="adjustment.amountYuan" :precision="2" style="width:100%"/></el-form-item><el-form-item label="调整原因"><el-input v-model="adjustment.reason" type="textarea" :rows="3" maxlength="200" show-word-limit/></el-form-item><div class="detail-item" style="background:#f5f7f5"><span>调整后虚拟余额</span><strong>虚拟 ¥{{centsToYuan(nextBalance)}}</strong></div></el-form><template #footer><el-button @click="adjustOpen=false">取消</el-button><el-button type="primary" :disabled="!adjustment.amountYuan||adjustment.reason.trim().length<2" @click="adjust">确认调整</el-button></template></el-dialog>
</template>
