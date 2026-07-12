<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import type { AdminRole } from '@baichile/api-contract';
import { adminApi, type AdminUser } from '../api/admin';
import { formatDate } from '../utils';
import { useAuthStore } from '../stores/auth';
const auth=useAuthStore(),loading=ref(false),items=ref<AdminUser[]>([]),total=ref(0),dialog=ref(false),creating=ref(false);
const filters=reactive({page:1,pageSize:20,keyword:'',status:''});
const form=reactive({id:'',username:'',displayName:'',password:'',role:'operator' as AdminRole,status:'active' as 'active'|'disabled'});
async function load(){loading.value=true;try{const r=await adminApi.listAdminUsers(filters);items.value=r.items;total.value=r.total;}catch(e){ElMessage.error(e instanceof Error?e.message:'管理员加载失败');}finally{loading.value=false;}}
function open(row?:AdminUser){creating.value=!row;Object.assign(form,row?{...row,password:''}:{id:'',username:'',displayName:'',password:'',role:'operator',status:'active'});dialog.value=true;}
async function save(){if(creating.value)await adminApi.createAdmin(form);else await adminApi.updateAdmin(form.id,{displayName:form.displayName,role:form.role,status:form.status});ElMessage.success('管理员已保存');dialog.value=false;await load();}
async function reset(row:AdminUser){const result=await ElMessageBox.prompt('输入至少 12 位且同时包含字母和数字的新密码','重置管理员密码',{inputType:'password',inputValidator:v=>(v.length>=12&&/[a-z]/i.test(v)&&/\d/.test(v))||'密码至少 12 位且必须同时包含字母和数字'});await adminApi.resetAdminPassword(row.id,result.value);ElMessage.success('密码已重置，该账号现有会话已撤销');}
onMounted(load);
</script>
<template>
  <div class="page-toolbar"><el-input v-model="filters.keyword" class="filter-input" clearable placeholder="搜索账号或姓名" :prefix-icon="Search" @keyup.enter="load"/><el-select v-model="filters.status" clearable placeholder="全部状态" style="width:140px" @change="load"><el-option label="启用" value="active"/><el-option label="禁用" value="disabled"/></el-select><el-button @click="load">查询</el-button><span class="grow"/><el-button type="primary" :icon="Plus" @click="open()">新增管理员</el-button></div>
  <div class="surface data-surface"><el-table v-loading="loading" :data="items"><el-table-column prop="username" label="账号" min-width="170"/><el-table-column prop="displayName" label="姓名" width="150"/><el-table-column prop="role" label="角色" width="130"/><el-table-column label="状态" width="90"><template #default="{row}"><el-tag :type="row.status==='active'?'success':'danger'" effect="plain">{{row.status==='active'?'启用':'禁用'}}</el-tag></template></el-table-column><el-table-column label="最近登录" width="180"><template #default="{row}">{{formatDate(row.lastLoginAt)}}</template></el-table-column><el-table-column label="操作" width="170"><template #default="{row}"><el-button link type="primary" @click="open(row)">编辑</el-button><el-button link @click="reset(row)">重置密码</el-button></template></el-table-column></el-table><div class="pagination"><el-pagination v-model:current-page="filters.page" :page-size="filters.pageSize" layout="total, prev, pager, next" :total="total" @current-change="load"/></div></div>
  <el-dialog v-model="dialog" :title="creating?'新增管理员':'编辑管理员'" width="520px"><el-form label-position="top"><el-form-item label="登录账号"><el-input v-model="form.username" :disabled="!creating"/></el-form-item><el-form-item label="显示名称"><el-input v-model="form.displayName"/></el-form-item><el-form-item v-if="creating" label="初始密码"><el-input v-model="form.password" type="password" show-password/></el-form-item><el-form-item label="角色"><el-select v-model="form.role" style="width:100%"><el-option label="超级管理员" value="super_admin"/><el-option label="运营" value="operator"/><el-option label="客服" value="support"/></el-select></el-form-item><el-form-item v-if="!creating" label="状态"><el-select v-model="form.status" style="width:100%" :disabled="form.id===auth.admin?.id"><el-option label="启用" value="active"/><el-option label="禁用" value="disabled"/></el-select></el-form-item></el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template></el-dialog>
</template>
