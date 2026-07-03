<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, Plus, Search, Switch } from '@element-plus/icons-vue';
import { adminApi, type MenuItemRecord, type StoreRecord } from '../api/admin';
import { centsToYuan, yuanToCents } from '../utils';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const storeId = String(route.params.storeId);
const activeTab = ref('store');
const storeLoading = ref(false);
const menuLoading = ref(false);
const store = ref<StoreRecord | null>(null);
const storeForm = reactive<any>({});
const items = ref<MenuItemRecord[]>([]);
const total = ref(0);
const filters = reactive({ page: 1, pageSize: 20, keyword: '', status: '', categoryId: '' });
const itemDialog = ref(false);
const itemCreating = ref(false);
const itemForm = reactive<any>({});
const transferDialog = ref(false);
const transferringItem = ref<MenuItemRecord | null>(null);
const targetStoreId = ref('');
const storeOptions = ref<StoreRecord[]>([]);

function fillStoreForm(value: StoreRecord) {
  Object.assign(storeForm, {
    ...value,
    tagsText: value.tags.join('，'),
    deliveryFeeYuan: centsToYuan(value.deliveryFeeCents),
    packingFeeYuan: centsToYuan(value.packingFeeCents),
    minimumOrderYuan: centsToYuan(value.minimumOrderCents),
  });
}

async function loadStore() {
  storeLoading.value = true;
  try {
    store.value = await adminApi.store(storeId);
    fillStoreForm(store.value);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '商家加载失败');
    await router.replace({ name: 'stores' });
  } finally {
    storeLoading.value = false;
  }
}

async function saveStore() {
  if (!store.value) return;
  try {
    const record = {
      ...storeForm,
      tags: String(storeForm.tagsText).split(/[，,]/).map((value) => value.trim()).filter(Boolean),
      deliveryFeeCents: yuanToCents(storeForm.deliveryFeeYuan),
      packingFeeCents: yuanToCents(storeForm.packingFeeYuan),
      minimumOrderCents: yuanToCents(storeForm.minimumOrderYuan),
    };
    store.value = await adminApi.saveStore(record, false);
    fillStoreForm(store.value);
    ElMessage.success('商家资料已保存');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '商家保存失败');
  }
}

function blankItem(): MenuItemRecord {
  return {
    id: '',
    storeId,
    categoryId: '',
    subCategoryId: '',
    name: '',
    subtitle: '',
    imageUrl: '',
    basePriceCents: 0,
    caloriesKcal: 0,
    calorieSource: {
      type: 'composition_estimate',
      description: '后台录入',
      referenceUrl: 'https://example.com',
    },
    monthlySales: 0,
    specGroups: [],
    sourceType: 'original',
    sortOrder: 0,
    status: 'active',
  };
}

async function loadMenuItems() {
  menuLoading.value = true;
  try {
    const result = await adminApi.listMenuItems(storeId, filters);
    items.value = result.items;
    total.value = result.total;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '菜品加载失败');
  } finally {
    menuLoading.value = false;
  }
}

function openItem(row?: MenuItemRecord) {
  itemCreating.value = !row;
  const value = row ?? blankItem();
  Object.assign(itemForm, {
    ...value,
    priceYuan: centsToYuan(value.basePriceCents),
    specText: JSON.stringify(value.specGroups, null, 2),
    calorieSourceText: JSON.stringify(value.calorieSource, null, 2),
  });
  itemDialog.value = true;
}

async function saveItem() {
  try {
    const record = {
      ...itemForm,
      storeId,
      basePriceCents: yuanToCents(itemForm.priceYuan),
      specGroups: JSON.parse(itemForm.specText),
      calorieSource: JSON.parse(itemForm.calorieSourceText),
    };
    if (!Array.isArray(record.specGroups)) throw new Error('规格组必须是数组');
    await adminApi.saveMenuItem(storeId, record, itemCreating.value);
    ElMessage.success(itemCreating.value ? '菜品已创建' : '菜品已保存');
    itemDialog.value = false;
    await loadMenuItems();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  }
}

async function toggleItem(row: MenuItemRecord) {
  const status = row.status === 'active' ? 'inactive' : 'active';
  await ElMessageBox.confirm(
    `确认${status === 'active' ? '上架' : '下架'}“${row.name}”？`,
    '状态确认',
  );
  await adminApi.saveMenuItem(storeId, { ...row, status }, false);
  await loadMenuItems();
}

async function openTransfer(row: MenuItemRecord) {
  transferringItem.value = row;
  targetStoreId.value = '';
  try {
    const result = await adminApi.listStores({ page: 1, pageSize: 100 });
    storeOptions.value = result.items.filter((item) => item.id !== storeId);
    transferDialog.value = true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '商家列表加载失败');
  }
}

async function transferItem() {
  if (!transferringItem.value || !targetStoreId.value) return;
  const target = storeOptions.value.find((item) => item.id === targetStoreId.value);
  await ElMessageBox.confirm(
    `确认将“${transferringItem.value.name}”迁移到“${target?.name ?? targetStoreId.value}”？`,
    '迁移菜品',
  );
  try {
    await adminApi.transferMenuItem(storeId, transferringItem.value.id, targetStoreId.value);
    ElMessage.success('菜品已迁移');
    transferDialog.value = false;
    await loadMenuItems();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '迁移失败');
  }
}

onMounted(async () => {
  await Promise.all([loadStore(), loadMenuItems()]);
});
</script>

<template>
  <div class="detail-heading">
    <el-button :icon="ArrowLeft" @click="router.push({ name: 'stores' })">返回商家列表</el-button>
    <div v-if="store">
      <h2>{{ store.name }}</h2>
      <span>{{ store.id }}</span>
    </div>
    <el-tag v-if="store" :type="store.status === 'active' ? 'success' : 'info'" effect="plain">
      {{ store.status === 'active' ? '上架' : '下架' }}
    </el-tag>
  </div>

  <div class="surface store-detail-surface">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="商家资料" name="store">
        <div v-loading="storeLoading" class="store-detail-pane">
          <el-form v-if="store" label-position="top">
            <div class="dialog-form-grid">
              <el-form-item label="商家 ID"><el-input v-model="storeForm.id" disabled /></el-form-item>
              <el-form-item label="所属分类"><el-input v-model="storeForm.categoryId" /></el-form-item>
              <el-form-item label="商家名称"><el-input v-model="storeForm.name" /></el-form-item>
              <el-form-item label="状态"><el-select v-model="storeForm.status" style="width:100%"><el-option label="上架" value="active" /><el-option label="下架" value="inactive" /></el-select></el-form-item>
              <el-form-item class="wide" label="简介"><el-input v-model="storeForm.description" type="textarea" :rows="2" /></el-form-item>
              <el-form-item class="wide" label="封面 URL"><el-input v-model="storeForm.coverUrl" /></el-form-item>
              <el-form-item class="wide" label="标签（逗号分隔）"><el-input v-model="storeForm.tagsText" /></el-form-item>
              <el-form-item label="配送费（元）"><el-input-number v-model="storeForm.deliveryFeeYuan" :min="0" :precision="2" style="width:100%" /></el-form-item>
              <el-form-item label="包装费（元）"><el-input-number v-model="storeForm.packingFeeYuan" :min="0" :precision="2" style="width:100%" /></el-form-item>
              <el-form-item label="起送金额（元）"><el-input-number v-model="storeForm.minimumOrderYuan" :min="0" :precision="2" style="width:100%" /></el-form-item>
              <el-form-item label="虚拟配送分钟"><el-input-number v-model="storeForm.virtualDeliveryMinutes" :min="1" style="width:100%" /></el-form-item>
              <el-form-item label="月销量"><el-input-number v-model="storeForm.monthlySales" :min="0" style="width:100%" /></el-form-item>
              <el-form-item label="距离（km）"><el-input-number v-model="storeForm.distanceKm" :min="0" :precision="2" style="width:100%" /></el-form-item>
              <el-form-item label="评分"><el-input-number v-model="storeForm.rating" :min="0" :max="5" :precision="1" style="width:100%" /></el-form-item>
              <el-form-item label="排序"><el-input-number v-model="storeForm.sortOrder" :min="0" style="width:100%" /></el-form-item>
            </div>
            <div class="form-actions"><el-button v-if="auth.has('catalog:write')" type="primary" @click="saveStore">保存商家资料</el-button></div>
          </el-form>
        </div>
      </el-tab-pane>

      <el-tab-pane label="菜品管理" name="menu">
        <div class="page-toolbar store-menu-toolbar">
          <el-input v-model="filters.keyword" class="filter-input" clearable placeholder="搜索当前商家菜品" :prefix-icon="Search" @keyup.enter="filters.page = 1; loadMenuItems()" />
          <el-input v-model="filters.categoryId" clearable placeholder="分类 ID" style="width:160px" @keyup.enter="filters.page = 1; loadMenuItems()" />
          <el-select v-model="filters.status" clearable placeholder="全部状态" style="width:140px" @change="filters.page = 1; loadMenuItems()"><el-option label="上架" value="active" /><el-option label="下架" value="inactive" /></el-select>
          <el-button @click="filters.page = 1; loadMenuItems()">查询</el-button><span class="grow" />
          <el-button v-if="auth.has('catalog:write')" type="primary" :icon="Plus" @click="openItem()">新增菜品</el-button>
        </div>
        <div class="data-surface">
          <el-table v-loading="menuLoading" :data="items">
            <el-table-column prop="name" label="菜品" min-width="180" />
            <el-table-column prop="categoryId" label="分类" width="120" />
            <el-table-column label="价格" width="100"><template #default="{ row }">¥{{ centsToYuan(row.basePriceCents) }}</template></el-table-column>
            <el-table-column prop="caloriesKcal" label="热量(kcal)" width="110" />
            <el-table-column prop="monthlySales" label="月销量" width="95" />
            <el-table-column label="状态" width="85"><template #default="{ row }"><el-tag :type="row.status === 'active' ? 'success' : 'info'" effect="plain">{{ row.status === 'active' ? '上架' : '下架' }}</el-tag></template></el-table-column>
            <el-table-column label="操作" width="220" fixed="right"><template #default="{ row }">
              <el-button link type="primary" @click="openItem(row)">编辑</el-button>
              <el-button v-if="auth.has('catalog:write')" link :icon="Switch" @click="openTransfer(row)">迁移</el-button>
              <el-button v-if="auth.has('catalog:write')" link :type="row.status === 'active' ? 'danger' : 'success'" @click="toggleItem(row)">{{ row.status === 'active' ? '下架' : '上架' }}</el-button>
            </template></el-table-column>
          </el-table>
          <div class="pagination"><el-pagination v-model:current-page="filters.page" :page-size="filters.pageSize" layout="total, prev, pager, next" :total="total" @current-change="loadMenuItems" /></div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>

  <el-dialog v-model="itemDialog" :title="itemCreating ? '新增菜品' : '编辑菜品'" width="760px">
    <el-alert title="菜品将归属于当前商家，普通编辑不能更改归属。" type="info" :closable="false" show-icon />
    <el-form label-position="top" class="dialog-form">
      <div class="dialog-form-grid">
        <el-form-item label="菜品 ID"><el-input v-model="itemForm.id" :disabled="!itemCreating" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="itemForm.name" /></el-form-item>
        <el-form-item label="分类 ID"><el-input v-model="itemForm.categoryId" /></el-form-item>
        <el-form-item label="子分类 ID"><el-input v-model="itemForm.subCategoryId" /></el-form-item>
        <el-form-item label="状态"><el-select v-model="itemForm.status" style="width:100%"><el-option label="上架" value="active" /><el-option label="下架" value="inactive" /></el-select></el-form-item>
        <el-form-item label="基础价格（元）"><el-input-number v-model="itemForm.priceYuan" :min="0" :precision="2" style="width:100%" /></el-form-item>
        <el-form-item class="wide" label="副标题"><el-input v-model="itemForm.subtitle" /></el-form-item>
        <el-form-item class="wide" label="图片 URL"><el-input v-model="itemForm.imageUrl" /></el-form-item>
        <el-form-item label="热量（kcal）"><el-input-number v-model="itemForm.caloriesKcal" :min="0" style="width:100%" /></el-form-item>
        <el-form-item label="月销量"><el-input-number v-model="itemForm.monthlySales" :min="0" style="width:100%" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="itemForm.sortOrder" :min="0" style="width:100%" /></el-form-item>
        <el-form-item class="wide" label="规格组 JSON"><el-input v-model="itemForm.specText" type="textarea" :rows="7" /></el-form-item>
        <el-form-item class="wide" label="热量来源 JSON"><el-input v-model="itemForm.calorieSourceText" type="textarea" :rows="4" /></el-form-item>
      </div>
    </el-form>
    <template #footer><el-button @click="itemDialog = false">取消</el-button><el-button type="primary" @click="saveItem">保存</el-button></template>
  </el-dialog>

  <el-dialog v-model="transferDialog" title="迁移菜品" width="480px">
    <el-form label-position="top">
      <el-form-item label="当前菜品"><el-input :model-value="transferringItem?.name" disabled /></el-form-item>
      <el-form-item label="目标商家">
        <el-select v-model="targetStoreId" filterable placeholder="请选择目标商家" style="width:100%">
          <el-option v-for="option in storeOptions" :key="option.id" :label="`${option.name}（${option.id}）`" :value="option.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer><el-button @click="transferDialog = false">取消</el-button><el-button type="primary" :disabled="!targetStoreId" @click="transferItem">确认迁移</el-button></template>
  </el-dialog>
</template>
