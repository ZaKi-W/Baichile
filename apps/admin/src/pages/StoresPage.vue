<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import ListFeedback from '../components/ListFeedback.vue';
import { adminApi, type StoreRecord } from '../api/admin';
import { centsToYuan, yuanToCents } from '../utils';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const loading = ref(false);
const error = ref('');
const items = ref<StoreRecord[]>([]);
const total = ref(0);
const filters = reactive({ page: 1, pageSize: 20, keyword: '', status: '' });
const dialog = ref(false);
const creating = ref(false);
const form = reactive<any>({});

function blank(): StoreRecord {
  return { id: '', categoryId: '', name: '', description: '', coverUrl: '', tags: [], deliveryFeeCents: 0, packingFeeCents: 0, minimumOrderCents: 0, virtualDeliveryMinutes: 30, monthlySales: 0, distanceKm: 1, rating: 5, recentViewers: 0, systemHeat: 0, sourceType: 'original', sortOrder: 0, status: 'active' };
}
async function load() {
  loading.value = true;
  error.value = '';
  try { const result = await adminApi.listStores(filters); items.value = result.items; total.value = result.total; }
  catch (reason) {
    items.value = [];
    total.value = 0;
    error.value = reason instanceof Error ? reason.message : '商家加载失败';
  }
  finally { loading.value = false; }
}
function search() { filters.page = 1; void load(); }
function open() {
  creating.value = true;
  Object.assign(form, { ...blank(), tagsText: '', deliveryFeeYuan: '0.00', packingFeeYuan: '0.00', minimumOrderYuan: '0.00' });
  dialog.value = true;
}
async function save() {
  const record = { ...form, tags: String(form.tagsText).split(/[，,]/).map((x) => x.trim()).filter(Boolean), deliveryFeeCents: yuanToCents(form.deliveryFeeYuan), packingFeeCents: yuanToCents(form.packingFeeYuan), minimumOrderCents: yuanToCents(form.minimumOrderYuan) };
  await adminApi.saveStore(record, creating.value);
  ElMessage.success(creating.value ? '商家已创建' : '商家已保存');
  dialog.value = false; await load();
}
async function toggle(row: StoreRecord) {
  const next = row.status === 'active' ? 'inactive' : 'active';
  await ElMessageBox.confirm(`确认${next === 'active' ? '上架' : '下架'}“${row.name}”？`, '状态确认');
  await adminApi.saveStore({ ...row, status: next }, false); await load();
}
onMounted(load);
</script>

<template>
  <div class="page-toolbar">
    <el-input v-model="filters.keyword" class="filter-input" clearable placeholder="搜索商家名称" :prefix-icon="Search" @keyup.enter="search" />
    <el-select v-model="filters.status" clearable placeholder="全部状态" style="width: 140px" @change="search"><el-option label="上架" value="active" /><el-option label="下架" value="inactive" /></el-select>
    <el-button @click="search">查询</el-button><span class="grow" />
    <el-button v-if="auth.has('catalog:write')" type="primary" :icon="Plus" @click="open()">新增商家</el-button>
  </div>
  <div class="surface data-surface">
    <el-table v-loading="loading" :data="items">
      <el-table-column prop="name" label="商家" min-width="180" />
      <el-table-column prop="categoryId" label="分类" width="130" />
      <el-table-column label="虚拟配送费" width="145"><template #default="{ row }">虚拟 ¥{{ centsToYuan(row.deliveryFeeCents) }}</template></el-table-column>
      <el-table-column prop="monthlySales" label="热度" width="100" />
      <el-table-column prop="rating" label="评分" width="80" />
      <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status === 'active' ? 'success' : 'info'" effect="plain">{{ row.status === 'active' ? '上架' : '下架' }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="170" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="router.push({ name: 'store-detail', params: { storeId: row.id } })">管理</el-button><el-button v-if="auth.has('catalog:write')" link :type="row.status === 'active' ? 'danger' : 'success'" @click="toggle(row)">{{ row.status === 'active' ? '下架' : '上架' }}</el-button></template></el-table-column>
      <template #empty><ListFeedback :error="error" empty-text="暂无符合条件的商家" @retry="load" /></template>
    </el-table>
    <div class="pagination"><el-pagination v-model:current-page="filters.page" v-model:page-size="filters.pageSize" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" :total="total" @current-change="load" @size-change="search" /></div>
  </div>
  <el-dialog v-model="dialog" title="新增商家" width="720px">
    <el-form label-position="top"><div class="dialog-form-grid">
      <el-form-item label="商家 ID"><el-input v-model="form.id" :disabled="!creating" /></el-form-item>
      <el-form-item label="所属分类"><el-input v-model="form.categoryId" /></el-form-item>
      <el-form-item label="商家名称"><el-input v-model="form.name" /></el-form-item>
      <el-form-item label="状态"><el-select v-model="form.status" style="width:100%"><el-option label="上架" value="active" /><el-option label="下架" value="inactive" /></el-select></el-form-item>
      <el-form-item class="wide" label="简介"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
      <el-form-item class="wide" label="封面 URL"><el-input v-model="form.coverUrl" /></el-form-item>
      <el-form-item class="wide" label="标签（逗号分隔）"><el-input v-model="form.tagsText" /></el-form-item>
      <el-form-item label="虚拟配送费（元）"><el-input-number v-model="form.deliveryFeeYuan" :min="0" :precision="2" style="width:100%" /></el-form-item>
      <el-form-item label="虚拟包装费（元）"><el-input-number v-model="form.packingFeeYuan" :min="0" :precision="2" style="width:100%" /></el-form-item>
      <el-form-item label="虚拟起送金额（元）"><el-input-number v-model="form.minimumOrderYuan" :min="0" :precision="2" style="width:100%" /></el-form-item>
      <el-form-item label="虚拟配送分钟"><el-input-number v-model="form.virtualDeliveryMinutes" :min="1" style="width:100%" /></el-form-item>
      <el-form-item label="热度"><el-input-number v-model="form.monthlySales" :min="0" style="width:100%" /></el-form-item>
      <el-form-item label="距离（km）"><el-input-number v-model="form.distanceKm" :min="0" :precision="2" style="width:100%" /></el-form-item>
      <el-form-item label="评分"><el-input-number v-model="form.rating" :min="0" :max="5" :precision="1" style="width:100%" /></el-form-item>
      <el-form-item label="排序"><el-input-number v-model="form.sortOrder" :min="0" style="width:100%" /></el-form-item>
    </div></el-form>
    <template #footer><el-button @click="dialog = false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
  </el-dialog>
</template>
