<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Download, Files, RefreshLeft, UploadFilled } from '@element-plus/icons-vue';
import type { CatalogImportJob, CatalogImportPayload, CatalogImportPreview } from '@baichile/api-contract';
import { adminApi } from '../api/admin';
import {
  applyCatalogAssetUrls,
  arrayBufferToBase64,
  downloadCatalogImportTemplate,
  parseCatalogImportZip,
  type CatalogImportBundle,
} from '../features/catalog-import';
import { formatDate } from '../utils';

const input = ref<HTMLInputElement>();
const bundle = ref<CatalogImportBundle | null>(null);
const payload = ref<CatalogImportPayload | null>(null);
const preview = ref<CatalogImportPreview | null>(null);
const jobs = ref<CatalogImportJob[]>([]);
const stage = ref<'ready' | 'uploading' | 'previewing' | 'publishing'>('ready');
const uploadProgress = ref({ current: 0, total: 0 });

const busy = computed(() => stage.value !== 'ready');
const uploadPercent = computed(() => uploadProgress.value.total
  ? Math.round((uploadProgress.value.current / uploadProgress.value.total) * 100)
  : 0);

async function loadJobs() {
  try { jobs.value = await adminApi.catalogImportJobs(); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '导入历史加载失败'); }
}

async function selectFile(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  try {
    bundle.value = await parseCatalogImportZip(file);
    payload.value = null;
    preview.value = null;
    ElMessage.success(`已读取 ${file.name}：${bundle.value.payload.stores.length} 家店铺、${bundle.value.payload.menuItems.length} 个菜品`);
  } catch (error) {
    bundle.value = null;
    payload.value = null;
    preview.value = null;
    ElMessage.error(error instanceof Error ? error.message : '导入包读取失败');
  } finally {
    target.value = '';
  }
}

async function uploadImagesAndPreview() {
  if (!bundle.value) return;
  stage.value = 'uploading';
  uploadProgress.value = { current: 0, total: bundle.value.imagePaths.length };
  try {
    const assetUrls = new Map<string, string>();
    for (const path of bundle.value.imagePaths) {
      const content = bundle.value.imageAssets.get(path);
      if (!content) throw new Error(`找不到图片：${path}`);
      const result = await adminApi.uploadCatalogAsset(await arrayBufferToBase64(content));
      assetUrls.set(path, result.url);
      uploadProgress.value.current += 1;
    }
    payload.value = applyCatalogAssetUrls(bundle.value, assetUrls);
    stage.value = 'previewing';
    preview.value = await adminApi.previewCatalogImport(payload.value);
    ElMessage.success('校验通过，可以发布');
  } catch (error) {
    payload.value = null;
    preview.value = null;
    ElMessage.error(error instanceof Error ? error.message : '导入校验失败');
  } finally {
    stage.value = 'ready';
  }
}

async function publish() {
  if (!payload.value || !preview.value) return;
  await ElMessageBox.confirm('发布后会同时更新本批次的分类、店铺、菜品和规格，并生成可回滚快照。确认发布？', '确认发布', { type: 'warning' });
  stage.value = 'publishing';
  try {
    const job = await adminApi.publishCatalogImport(payload.value);
    jobs.value = [job, ...jobs.value];
    ElMessage.success('目录数据已发布');
    bundle.value = null;
    payload.value = null;
    preview.value = null;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '发布失败');
  } finally {
    stage.value = 'ready';
  }
}

async function rollback(job: CatalogImportJob) {
  await ElMessageBox.confirm(`确认回滚“${job.fileName}”这一个导入批次？之后的批次不会受到影响。`, '确认回滚', { type: 'warning' });
  try {
    const saved = await adminApi.rollbackCatalogImport(job.id);
    jobs.value = jobs.value.map((item) => item.id === saved.id ? saved : item);
    ElMessage.success('该导入批次已回滚');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '回滚失败');
  }
}

onMounted(loadJobs);
</script>

<template>
  <div class="catalog-import-page">
    <section class="import-intro">
      <div>
        <p class="eyebrow">CATALOG OPERATIONS</p>
        <h2>批量导入商品目录</h2>
        <p>将分类、店铺、菜品、可选规格和静态图片放入一个 ZIP；系统先校验关联关系，再上传图片并发布。</p>
      </div>
      <el-button :icon="Download" @click="downloadCatalogImportTemplate">下载表格模板</el-button>
    </section>

    <section class="import-workbench">
      <div class="import-panel">
        <div class="panel-heading"><el-icon><Files /></el-icon><div><h3>1. 上传导入包</h3><p>压缩包内必须包含 catalog.xlsx 和 images/ 目录。</p></div></div>
        <input ref="input" class="visually-hidden" type="file" accept=".zip,application/zip" @change="selectFile" />
        <button class="import-dropzone" type="button" :disabled="busy" @click="input?.click()">
          <el-icon><UploadFilled /></el-icon>
          <strong>{{ bundle ? bundle.fileName : '选择 ZIP 导入包' }}</strong>
          <span>{{ bundle ? `${bundle.imagePaths.length} 张关联图片待上传` : '支持 .zip，单张图片最大 4MB' }}</span>
        </button>
        <div v-if="bundle" class="bundle-summary">
          <span>分类 {{ bundle.payload.categories.length }}</span><span>店铺 {{ bundle.payload.stores.length }}</span><span>菜品 {{ bundle.payload.menuItems.length }}</span><span>规格行 {{ bundle.payload.specs?.length ?? 0 }}</span>
        </div>
      </div>

      <div class="import-panel import-action-panel">
        <div class="panel-heading"><el-icon><RefreshLeft /></el-icon><div><h3>2. 校验并发布</h3><p>图片先进入 CDN，目录数据仅在校验通过并确认后发布。</p></div></div>
        <el-progress v-if="stage === 'uploading'" :percentage="uploadPercent" :stroke-width="10" :format="() => `上传图片 ${uploadProgress.current}/${uploadProgress.total}`" />
        <div v-else-if="preview" class="preview-summary">
          <div><span>分类</span><strong>+{{ preview.summary.categories.created }} / 更新 {{ preview.summary.categories.updated }}</strong></div>
          <div><span>店铺</span><strong>+{{ preview.summary.stores.created }} / 更新 {{ preview.summary.stores.updated }}</strong></div>
          <div><span>菜品</span><strong>+{{ preview.summary.menuItems.created }} / 更新 {{ preview.summary.menuItems.updated }}</strong></div>
          <div><span>规格行</span><strong>{{ preview.summary.specRows }}</strong></div>
          <el-alert v-for="warning in preview.warnings" :key="warning" type="warning" :title="warning" :closable="false" />
        </div>
        <div v-else class="preview-placeholder">上传后将显示新增、更新和风险提示。</div>
        <div class="import-actions">
          <el-button :loading="stage === 'uploading' || stage === 'previewing'" :disabled="!bundle || busy" @click="uploadImagesAndPreview">校验导入包</el-button>
          <el-button type="primary" :loading="stage === 'publishing'" :disabled="!preview || busy" @click="publish">确认发布</el-button>
        </div>
      </div>
    </section>

    <section class="section-title"><div><h2>导入历史</h2><span>仅可回滚整批数据，图片会保留在 CDN 中以避免影响其他批次。</span></div><el-button text @click="loadJobs">刷新</el-button></section>
    <section class="surface data-surface">
      <el-table :data="jobs" empty-text="暂无导入记录">
        <el-table-column prop="fileName" label="导入包" min-width="250" />
        <el-table-column label="内容" min-width="270"><template #default="{ row }">分类 {{ row.summary.categories.created + row.summary.categories.updated }} · 店铺 {{ row.summary.stores.created + row.summary.stores.updated }} · 菜品 {{ row.summary.menuItems.created + row.summary.menuItems.updated }} · 规格 {{ row.summary.specRows }}</template></el-table-column>
        <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="row.status === 'published' ? 'success' : 'info'" effect="plain">{{ row.status === 'published' ? '已发布' : '已回滚' }}</el-tag></template></el-table-column>
        <el-table-column label="时间" width="180"><template #default="{ row }">{{ formatDate(row.createdAt) }}</template></el-table-column>
        <el-table-column label="操作" width="110" fixed="right"><template #default="{ row }"><el-button v-if="row.status === 'published'" link type="danger" @click="rollback(row)">回滚</el-button><span v-else>—</span></template></el-table-column>
      </el-table>
    </section>
  </div>
</template>
