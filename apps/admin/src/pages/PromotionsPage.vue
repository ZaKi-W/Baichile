<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import ListFeedback from '../components/ListFeedback.vue';
import {
  adminApi,
  type PromotionInput,
  type PromotionRecord,
  type PromotionTier,
  type PromotionType,
} from '../api/admin';
import { ApiRequestError } from '../api/http';
import { centsToYuan, formatDate, yuanToCents } from '../utils';
import { useAuthStore } from '../stores/auth';

interface PromotionTierForm {
  thresholdYuan: number;
  discountYuan: number;
}

interface PromotionForm {
  id: string;
  name: string;
  type: PromotionType;
  storeId: string;
  menuItemId: string;
  flashPriceYuan: number;
  tiers: PromotionTierForm[];
  window: [Date, Date] | [];
}

const auth = useAuthStore();
const loading = ref(false);
const error = ref('');
const items = ref<PromotionRecord[]>([]);
const total = ref(0);
const filters = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  type: '',
  lifecycleStatus: '',
  storeId: '',
});
const drawerOpen = ref(false);
const saving = ref(false);
const saveError = ref('');
const form = reactive<PromotionForm>(blankForm());
const editing = computed(() => Boolean(form.id));

const typeLabels: Record<PromotionType, string> = {
  item_flash: '菜品限时价',
  store_threshold: '店铺满减',
};
const statusLabels: Record<PromotionRecord['lifecycleStatus'], string> = {
  draft: '草稿',
  published: '已发布',
  paused: '已暂停',
};

function blankForm(): PromotionForm {
  const start = new Date();
  start.setMinutes(start.getMinutes() + 10, 0, 0);
  const end = new Date(start);
  end.setHours(end.getHours() + 2);
  return {
    id: '',
    name: '',
    type: 'item_flash',
    storeId: '',
    menuItemId: '',
    flashPriceYuan: 0,
    tiers: [{ thresholdYuan: 30, discountYuan: 5 }],
    window: [start, end],
  };
}

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

function overlapMessage(reason: unknown): string {
  if (reason instanceof ApiRequestError && reason.status === 409) {
    return '发布时间与同店、同目标、同类型活动重叠。请调整生效时间，或先暂停冲突活动。';
  }
  return messageOf(reason, '促销操作失败');
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await adminApi.listPromotions(filters);
    items.value = result.items;
    total.value = result.total;
  } catch (reason) {
    items.value = [];
    total.value = 0;
    error.value = messageOf(reason, '促销列表加载失败');
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, blankForm());
  saveError.value = '';
  drawerOpen.value = true;
}

function openEdit(row: PromotionRecord) {
  Object.assign(form, {
    id: row.id,
    name: row.name,
    type: row.type,
    storeId: row.storeId,
    menuItemId: row.menuItemId ?? '',
    flashPriceYuan: row.flashPriceCents ? Number(centsToYuan(row.flashPriceCents)) : 0,
    tiers: (row.tiers ?? []).map((tier) => ({
      thresholdYuan: Number(centsToYuan(tier.thresholdCents)),
      discountYuan: Number(centsToYuan(tier.discountCents)),
    })),
    window: [new Date(row.startsAt), new Date(row.endsAt)],
  } satisfies PromotionForm);
  if (!form.tiers.length) form.tiers.push({ thresholdYuan: 30, discountYuan: 5 });
  saveError.value = '';
  drawerOpen.value = true;
}

function addTier() {
  const last = form.tiers.at(-1);
  form.tiers.push({
    thresholdYuan: (last?.thresholdYuan ?? 0) + 20,
    discountYuan: (last?.discountYuan ?? 0) + 3,
  });
}

function removeTier(index: number) {
  form.tiers.splice(index, 1);
}

function toPayload(): PromotionInput {
  const name = form.name.trim();
  const storeId = form.storeId.trim();
  if (!name) throw new Error('请输入活动名称');
  if (!storeId) throw new Error('请输入店铺 ID');
  if (form.window.length !== 2 || form.window[1] <= form.window[0]) {
    throw new Error('请选择正确的开始和结束时间');
  }

  if (form.type === 'item_flash') {
    if (!form.menuItemId.trim()) throw new Error('限时价必须指定菜品 ID');
    const flashPriceCents = yuanToCents(form.flashPriceYuan);
    if (flashPriceCents <= 0) throw new Error('虚拟限时价必须大于 0');
    return {
      name,
      type: form.type,
      storeId,
      menuItemId: form.menuItemId.trim(),
      flashPriceCents,
      tiers: [],
      startsAt: form.window[0].toISOString(),
      endsAt: form.window[1].toISOString(),
    };
  }

  if (!form.tiers.length) throw new Error('店铺满减至少需要一个阶梯');
  const tiers: PromotionTier[] = form.tiers.map((tier, index) => {
    const thresholdCents = yuanToCents(tier.thresholdYuan);
    const discountCents = yuanToCents(tier.discountYuan);
    if (thresholdCents <= 0 || discountCents <= 0 || discountCents >= thresholdCents) {
      throw new Error(`第 ${index + 1} 档需满足：门槛 > 优惠 > 0`);
    }
    return { thresholdCents, discountCents };
  }).sort((left, right) => left.thresholdCents - right.thresholdCents);
  if (new Set(tiers.map((tier) => tier.thresholdCents)).size !== tiers.length) {
    throw new Error('满减门槛不能重复');
  }
  return {
    name,
    type: form.type,
    storeId,
    menuItemId: null,
    flashPriceCents: null,
    tiers,
    startsAt: form.window[0].toISOString(),
    endsAt: form.window[1].toISOString(),
  };
}

async function save() {
  saveError.value = '';
  let payload: PromotionInput;
  try {
    payload = toPayload();
  } catch (reason) {
    saveError.value = messageOf(reason, '请检查活动配置');
    return;
  }
  saving.value = true;
  try {
    if (editing.value) await adminApi.updatePromotion(form.id, payload);
    else await adminApi.createPromotion(payload);
    ElMessage.success(editing.value ? '促销草稿已更新' : '促销草稿已创建');
    drawerOpen.value = false;
    await load();
  } catch (reason) {
    saveError.value = overlapMessage(reason);
  } finally {
    saving.value = false;
  }
}

async function publish(row: PromotionRecord) {
  await ElMessageBox.confirm(
    `发布“${row.name}”后将按配置时间影响虚拟结算，确认继续？`,
    '发布促销',
    { type: 'warning' },
  );
  try {
    await adminApi.publishPromotion(row.id);
    ElMessage.success('促销已发布');
    await load();
  } catch (reason) {
    error.value = overlapMessage(reason);
    ElMessage.error(error.value);
  }
}

async function pause(row: PromotionRecord) {
  await ElMessageBox.confirm(
    `暂停“${row.name}”后，新结算不再享受该虚拟优惠，确认继续？`,
    '暂停促销',
    { type: 'warning' },
  );
  try {
    await adminApi.pausePromotion(row.id);
    ElMessage.success('促销已暂停');
    await load();
  } catch (reason) {
    ElMessage.error(messageOf(reason, '促销暂停失败'));
  }
}

async function remove(row: PromotionRecord) {
  await ElMessageBox.confirm(
    `确认删除“${row.name}”？操作会写入审计日志，且无法在后台恢复。`,
    '删除促销',
    { type: 'warning', confirmButtonText: '确认删除' },
  );
  try {
    await adminApi.deletePromotion(row.id);
    ElMessage.success('促销已删除');
    if (items.value.length === 1 && filters.page > 1) filters.page -= 1;
    await load();
  } catch (reason) {
    ElMessage.error(messageOf(reason, '促销删除失败'));
  }
}

function search() {
  filters.page = 1;
  void load();
}

onMounted(load);
</script>

<template>
  <section class="operations-intro">
    <div>
      <p class="eyebrow">PROMOTION OPERATIONS</p>
      <h2>促销规则与发布窗口</h2>
      <p>活动仅影响应用内虚拟结算；同店、同目标、同类型的生效时间不可重叠。</p>
    </div>
    <el-button v-if="auth.has('promotions:write')" type="primary" :icon="Plus" @click="openCreate">
      新建促销
    </el-button>
  </section>

  <div class="page-toolbar">
    <el-input
      v-model="filters.keyword"
      class="filter-input"
      clearable
      placeholder="搜索活动名称或 ID"
      :prefix-icon="Search"
      @keyup.enter="search"
    />
    <el-input v-model="filters.storeId" clearable placeholder="店铺 ID" style="width: 170px" @keyup.enter="search" />
    <el-select v-model="filters.type" clearable placeholder="全部类型" style="width: 150px" @change="search">
      <el-option label="菜品限时价" value="item_flash" />
      <el-option label="店铺满减" value="store_threshold" />
    </el-select>
    <el-select v-model="filters.lifecycleStatus" clearable placeholder="全部状态" style="width: 130px" @change="search">
      <el-option label="草稿" value="draft" />
      <el-option label="已发布" value="published" />
      <el-option label="已暂停" value="paused" />
    </el-select>
    <el-button @click="search">查询</el-button>
    <span class="grow" />
  </div>

  <el-alert v-if="error && items.length" class="page-error" type="error" :title="error" show-icon :closable="false">
    <template #default><el-button link type="danger" @click="load">重新加载</el-button></template>
  </el-alert>

  <div class="surface data-surface">
    <el-table v-loading="loading" :data="items">
      <el-table-column prop="name" label="活动" min-width="190">
        <template #default="{ row }">
          <div class="cell-primary">{{ row.name }}</div>
          <div class="cell-secondary">{{ row.id }}</div>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="130">
        <template #default="{ row }">{{ typeLabels[row.type as PromotionType] }}</template>
      </el-table-column>
      <el-table-column prop="storeId" label="店铺 ID" min-width="150" />
      <el-table-column label="虚拟优惠" min-width="170">
        <template #default="{ row }">
          <template v-if="row.type === 'item_flash'">
            菜品 {{ row.menuItemId }} · 虚拟 ¥{{ centsToYuan(row.flashPriceCents ?? 0) }}
          </template>
          <template v-else>
            {{ (row.tiers ?? []).map((tier: PromotionTier) => `满${centsToYuan(tier.thresholdCents)}减${centsToYuan(tier.discountCents)}`).join('；') }}
          </template>
        </template>
      </el-table-column>
      <el-table-column label="生效窗口" width="210">
        <template #default="{ row }">
          <div>{{ formatDate(row.startsAt) }}</div>
          <div class="cell-secondary">至 {{ formatDate(row.endsAt) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="95">
        <template #default="{ row }">
          <el-tag
            :type="row.lifecycleStatus === 'published' ? 'success' : row.lifecycleStatus === 'paused' ? 'warning' : 'info'"
            effect="plain"
          >
            {{ statusLabels[row.lifecycleStatus as PromotionRecord['lifecycleStatus']] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="210" fixed="right">
        <template #default="{ row }">
          <template v-if="auth.has('promotions:write')">
            <el-button v-if="row.lifecycleStatus !== 'published'" link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="row.lifecycleStatus !== 'published'" link type="success" @click="publish(row)">发布</el-button>
            <el-button v-else link type="warning" @click="pause(row)">暂停</el-button>
            <el-button v-if="row.lifecycleStatus !== 'published'" link type="danger" @click="remove(row)">删除</el-button>
          </template>
          <span v-else>仅查看</span>
        </template>
      </el-table-column>
      <template #empty>
        <ListFeedback :error="error" empty-text="暂无符合条件的促销" @retry="load" />
      </template>
    </el-table>
    <div class="pagination">
      <el-pagination
        v-model:current-page="filters.page"
        v-model:page-size="filters.pageSize"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        :total="total"
        @current-change="load"
        @size-change="search"
      />
    </div>
  </div>

  <el-drawer v-model="drawerOpen" :title="editing ? '编辑促销草稿' : '新建促销草稿'" size="620px">
    <el-alert
      class="promotion-disclosure"
      type="info"
      title="金额均为应用内虚拟资金口径，不代表真实支付或商户补贴。"
      :closable="false"
      show-icon
    />
    <el-alert v-if="saveError" class="promotion-disclosure" type="error" :title="saveError" :closable="false" show-icon />
    <el-form label-position="top">
      <div class="dialog-form-grid">
        <el-form-item class="wide" label="活动名称">
          <el-input v-model="form.name" maxlength="60" show-word-limit />
        </el-form-item>
        <el-form-item label="促销类型">
          <el-select v-model="form.type" style="width: 100%" :disabled="editing">
            <el-option label="菜品限时价" value="item_flash" />
            <el-option label="店铺满减" value="store_threshold" />
          </el-select>
        </el-form-item>
        <el-form-item label="店铺 ID">
          <el-input v-model="form.storeId" :disabled="editing" />
        </el-form-item>
        <template v-if="form.type === 'item_flash'">
          <el-form-item label="菜品 ID">
            <el-input v-model="form.menuItemId" :disabled="editing" />
          </el-form-item>
          <el-form-item label="虚拟限时价（元）">
            <el-input-number v-model="form.flashPriceYuan" :min="0.01" :precision="2" style="width: 100%" />
          </el-form-item>
        </template>
        <el-form-item class="wide" label="生效时间">
          <el-date-picker
            v-model="form.window"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            style="width: 100%"
          />
        </el-form-item>
      </div>

      <template v-if="form.type === 'store_threshold'">
        <div class="tier-heading">
          <div><strong>虚拟满减阶梯</strong><span>门槛不可重复，优惠必须小于门槛。</span></div>
          <el-button text type="primary" :icon="Plus" @click="addTier">增加阶梯</el-button>
        </div>
        <div v-for="(tier, index) in form.tiers" :key="index" class="tier-row">
          <span>第 {{ index + 1 }} 档</span>
          <el-input-number v-model="tier.thresholdYuan" :min="0.01" :precision="2" />
          <span>元，减</span>
          <el-input-number v-model="tier.discountYuan" :min="0.01" :precision="2" />
          <span>虚拟元</span>
          <el-button link type="danger" :disabled="form.tiers.length === 1" @click="removeTier(index)">移除</el-button>
        </div>
      </template>
    </el-form>
    <template #footer>
      <el-button @click="drawerOpen = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存草稿</el-button>
    </template>
  </el-drawer>
</template>
