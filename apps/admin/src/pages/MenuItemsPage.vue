<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import { adminApi, type MenuItemRecord } from '../api/admin';
import { centsToYuan, yuanToCents } from '../utils';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const loading = ref(false), dialog = ref(false), creating = ref(false);
const items = ref<MenuItemRecord[]>([]), total = ref(0);
const filters = reactive({ page: 1, pageSize: 20, keyword: '', status: '', storeId: '' });
const form = reactive<any>({});
function blank(): MenuItemRecord { return { id: '', storeId: '', categoryId: '', subCategoryId: '', name: '', subtitle: '', imageUrl: '', basePriceCents: 0, caloriesKcal: 0, calorieSource: { type: 'composition_estimate', description: '后台录入', referenceUrl: 'https://example.com' }, monthlySales: 0, specGroups: [], sourceType: 'original', sortOrder: 0, status: 'active' }; }
async function load() { loading.value = true; try { const r = await adminApi.listMenuItems(filters); items.value = r.items; total.value = r.total; } catch (e) { ElMessage.error(e instanceof Error ? e.message : '菜品加载失败'); } finally { loading.value = false; } }
function open(row?: MenuItemRecord) { creating.value = !row; const value = row ?? blank(); Object.assign(form, { ...value, priceYuan: centsToYuan(value.basePriceCents), specText: JSON.stringify(value.specGroups, null, 2), calorieSourceText: JSON.stringify(value.calorieSource, null, 2) }); dialog.value = true; }
async function save() {
  try {
    const record = { ...form, basePriceCents: yuanToCents(form.priceYuan), specGroups: JSON.parse(form.specText), calorieSource: JSON.parse(form.calorieSourceText) };
    if (!Array.isArray(record.specGroups)) throw new Error('规格组必须是数组');
    await adminApi.saveMenuItem(record, creating.value); ElMessage.success('菜品已保存'); dialog.value = false; await load();
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : '保存失败'); }
}
async function toggle(row: MenuItemRecord) { const status = row.status === 'active' ? 'inactive' : 'active'; await ElMessageBox.confirm(`确认${status === 'active' ? '上架' : '下架'}“${row.name}”？`, '状态确认'); await adminApi.saveMenuItem({ ...row, status }, false); await load(); }
onMounted(load);
</script>

<template>
  <div class="page-toolbar">
    <el-input v-model="filters.keyword" class="filter-input" clearable placeholder="搜索菜品" :prefix-icon="Search" @keyup.enter="load" />
    <el-input v-model="filters.storeId" clearable placeholder="商家 ID" style="width:180px" @keyup.enter="load" />
    <el-select v-model="filters.status" clearable placeholder="全部状态" style="width:140px" @change="load"><el-option label="上架" value="active" /><el-option label="下架" value="inactive" /></el-select>
    <el-button @click="filters.page=1; load()">查询</el-button><span class="grow" />
    <el-button v-if="auth.has('catalog:write')" type="primary" :icon="Plus" @click="open()">新增菜品</el-button>
  </div>
  <div class="surface data-surface">
    <el-table v-loading="loading" :data="items">
      <el-table-column prop="name" label="菜品" min-width="180" />
      <el-table-column prop="storeId" label="商家 ID" min-width="160" />
      <el-table-column prop="categoryId" label="分类" width="120" />
      <el-table-column label="价格" width="100"><template #default="{ row }">¥{{ centsToYuan(row.basePriceCents) }}</template></el-table-column>
      <el-table-column prop="caloriesKcal" label="热量(kcal)" width="110" />
      <el-table-column prop="monthlySales" label="月销量" width="95" />
      <el-table-column label="状态" width="85"><template #default="{ row }"><el-tag :type="row.status==='active'?'success':'info'" effect="plain">{{ row.status==='active'?'上架':'下架' }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="150" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="open(row)">编辑</el-button><el-button v-if="auth.has('catalog:write')" link :type="row.status==='active'?'danger':'success'" @click="toggle(row)">{{ row.status==='active'?'下架':'上架' }}</el-button></template></el-table-column>
    </el-table>
    <div class="pagination"><el-pagination v-model:current-page="filters.page" :page-size="filters.pageSize" layout="total, prev, pager, next" :total="total" @current-change="load" /></div>
  </div>
  <el-dialog v-model="dialog" :title="creating?'新增菜品':'编辑菜品'" width="760px">
    <el-form label-position="top"><div class="dialog-form-grid">
      <el-form-item label="菜品 ID"><el-input v-model="form.id" :disabled="!creating" /></el-form-item>
      <el-form-item label="商家 ID"><el-input v-model="form.storeId" /></el-form-item>
      <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
      <el-form-item label="分类 ID"><el-input v-model="form.categoryId" /></el-form-item>
      <el-form-item label="子分类 ID"><el-input v-model="form.subCategoryId" /></el-form-item>
      <el-form-item label="状态"><el-select v-model="form.status" style="width:100%"><el-option label="上架" value="active" /><el-option label="下架" value="inactive" /></el-select></el-form-item>
      <el-form-item class="wide" label="副标题"><el-input v-model="form.subtitle" /></el-form-item>
      <el-form-item class="wide" label="图片 URL"><el-input v-model="form.imageUrl" /></el-form-item>
      <el-form-item label="基础价格（元）"><el-input-number v-model="form.priceYuan" :min="0" :precision="2" style="width:100%" /></el-form-item>
      <el-form-item label="热量（kcal）"><el-input-number v-model="form.caloriesKcal" :min="0" style="width:100%" /></el-form-item>
      <el-form-item label="月销量"><el-input-number v-model="form.monthlySales" :min="0" style="width:100%" /></el-form-item>
      <el-form-item label="排序"><el-input-number v-model="form.sortOrder" :min="0" style="width:100%" /></el-form-item>
      <el-form-item class="wide" label="规格组 JSON"><el-input v-model="form.specText" type="textarea" :rows="7" /></el-form-item>
      <el-form-item class="wide" label="热量来源 JSON"><el-input v-model="form.calorieSourceText" type="textarea" :rows="4" /></el-form-item>
    </div></el-form>
    <template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
  </el-dialog>
</template>
