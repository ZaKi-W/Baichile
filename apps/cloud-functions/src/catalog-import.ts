import { createHash, randomUUID } from 'node:crypto';
import type {
  CatalogImportCategoryInput,
  CatalogImportJob,
  CatalogImportMenuItemInput,
  CatalogImportPayload,
  CatalogImportPreview,
  CatalogImportSpecInput,
  CatalogImportStoreInput,
  CatalogImportSummary,
  ManagedContentStatus,
} from '@baichile/api-contract';
import type { SpecGroup } from '@baichile/domain';
import { refreshStoreSearchText } from './catalog-search';
import { collections } from './collections';
import type { Database, ListOptions } from './database';
import { badRequest, CloudApiError, conflict, notFound } from './errors';
import type {
  CatalogImportJobDoc,
  CatalogImportSnapshotDoc,
  CategoryDoc,
  MenuItemDoc,
  StoreDoc,
} from './models';
import type { AuthenticatedAdmin } from './admin-security';

const PAGE_SIZE = 100;
const MAX_CATALOG_IMAGE_BYTES = 4 * 1024 * 1024;
const CATALOG_ASSET_PATH = 'catalog-assets';

export interface CatalogImportAudit {
  record(actor: AuthenticatedAdmin, input: {
    action: string;
    resourceType: string;
    resourceId?: string | null;
    beforeData?: unknown;
    afterData?: unknown;
    ipAddress?: string | null;
  }, db?: Database): Promise<void>;
}

export class CatalogImportService {
  constructor(private readonly db: Database, private readonly audit: CatalogImportAudit) {}

  async preview(value: unknown): Promise<CatalogImportPreview> {
    const payload = parseCatalogImportPayload(value);
    const normalized = await this.normalize(payload);
    return { summary: normalized.summary, warnings: normalized.warnings };
  }

  async publish(value: unknown, actor: AuthenticatedAdmin, ipAddress?: string | null): Promise<CatalogImportJob> {
    const payload = parseCatalogImportPayload(value);
    const normalized = await this.normalize(payload);
    const id = randomUUID();
    const now = this.db.now().toISOString();
    const job: CatalogImportJobDoc = {
      _id: id,
      id,
      fileName: payload.fileName,
      status: 'published',
      summary: normalized.summary,
      adminUserId: actor.id,
      createdAt: now,
      rolledBackAt: null,
    };

    await this.db.transaction(async (tx) => {
      await tx.collection<CatalogImportJobDoc>(collections.catalogImportJobs).insert(job);
      await saveRowsWithSnapshots(tx, id, collections.categories, 'category', normalized.categories);
      await saveRowsWithSnapshots(tx, id, collections.stores, 'store', normalized.stores);
      await saveRowsWithSnapshots(tx, id, collections.menuItems, 'menu_item', normalized.menuItems);
      await Promise.all([...new Set(normalized.menuItems.map((item) => item.storeId))]
        .map((storeId) => refreshStoreSearchText(tx, storeId)));
      await this.audit.record(actor, {
        action: 'catalog_import.publish',
        resourceType: 'catalog_import',
        resourceId: id,
        afterData: { fileName: job.fileName, summary: job.summary },
        ipAddress,
      }, tx);
    });
    return toJob(job);
  }

  async listJobs(): Promise<CatalogImportJob[]> {
    const rows = await listAll(this.db.collection<CatalogImportJobDoc>(collections.catalogImportJobs), {
      orderBy: [['createdAt', 'desc']],
    });
    return rows.map(toJob);
  }

  async rollback(id: string, actor: AuthenticatedAdmin, ipAddress?: string | null): Promise<CatalogImportJob> {
    const job = await this.db.collection<CatalogImportJobDoc>(collections.catalogImportJobs).get(id);
    if (!job) notFound('导入批次不存在', 'CATALOG_IMPORT_NOT_FOUND');
    if (job.status !== 'published') conflict('该导入批次已经回滚', 'CATALOG_IMPORT_ALREADY_ROLLED_BACK');
    const snapshots = await listAll(this.db.collection<CatalogImportSnapshotDoc>(collections.catalogImportSnapshots), {
      where: { jobId: id },
    });
    if (!snapshots.length) conflict('该导入批次没有可回滚的数据', 'CATALOG_IMPORT_SNAPSHOT_MISSING');
    const affectedStoreIds = new Set<string>();
    for (const snapshot of snapshots) {
      if (snapshot.resourceType === 'store') affectedStoreIds.add(snapshot.resourceId);
      if (snapshot.resourceType === 'menu_item') {
        const previous = snapshot.beforeData as MenuItemDoc | null;
        if (previous) affectedStoreIds.add(previous.storeId);
        const current = await this.db.collection<MenuItemDoc>(collections.menuItems).get(snapshot.resourceId);
        if (current) affectedStoreIds.add(current.storeId);
      }
    }
    const rolledBackAt = this.db.now().toISOString();
    await this.db.transaction(async (tx) => {
      for (const snapshot of [...snapshots].reverse()) {
        await restoreSnapshot(tx, snapshot);
      }
      await tx.collection<CatalogImportJobDoc>(collections.catalogImportJobs).update(id, {
        status: 'rolled_back',
        rolledBackAt,
      });
      await Promise.all([...affectedStoreIds].map((storeId) => refreshStoreSearchText(tx, storeId)));
      await this.audit.record(actor, {
        action: 'catalog_import.rollback',
        resourceType: 'catalog_import',
        resourceId: id,
        beforeData: { summary: job.summary },
        afterData: { rolledBackAt },
        ipAddress,
      }, tx);
    });
    return toJob({ ...job, status: 'rolled_back', rolledBackAt });
  }

  private async normalize(payload: CatalogImportPayload): Promise<NormalizedCatalogImport> {
    const [existingCategories, existingStores, existingMenuItems] = await Promise.all([
      listAll(this.db.collection<CategoryDoc>(collections.categories)),
      listAll(this.db.collection<StoreDoc>(collections.stores)),
      listAll(this.db.collection<MenuItemDoc>(collections.menuItems)),
    ]);
    ensureUnique(payload.categories, '分类', (row) => row.id);
    ensureUnique(payload.stores, '店铺', (row) => row.id);
    ensureUnique(payload.menuItems, '菜品', (row) => row.id);
    ensureUnique(payload.specs ?? [], '规格选项', (row) => `${row.menuItemId}:${row.groupId}:${row.optionId}`);

    const categoriesById = new Map(payload.categories.map((row) => [row.id, row]));
    const storesById = new Map(payload.stores.map((row) => [row.id, row]));
    const menuItemIds = new Set(payload.menuItems.map((row) => row.id));
    for (const spec of payload.specs ?? []) {
      if (!menuItemIds.has(spec.menuItemId)) badRequest(`规格引用了不存在的菜品“${spec.menuItemId}”`, 'CATALOG_IMPORT_MENU_ITEM_MISSING');
    }
    const categories = payload.categories.map((row) => ({
      _id: row.id,
      id: row.id,
      name: row.name,
      icon: row.icon,
      sortOrder: row.sortOrder,
    } satisfies CategoryDoc));
    const stores = payload.stores.map((row) => {
      if (!categoriesById.has(row.categoryId)) badRequest(`店铺“${row.name}”引用了不存在的分类“${row.categoryId}”`, 'CATALOG_IMPORT_CATEGORY_MISSING');
      return normalizeStore(row, existingStores.find((item) => item.id === row.id));
    });
    const specsByItem = buildSpecGroups(payload.specs ?? []);
    const menuItems = payload.menuItems.map((row) => {
      const store = storesById.get(row.storeId);
      if (!store) badRequest(`菜品“${row.name}”引用了不存在的店铺“${row.storeId}”`, 'CATALOG_IMPORT_STORE_MISSING');
      if (row.categoryId !== store.categoryId) badRequest(`菜品“${row.name}”的分类必须与所属店铺一致`, 'CATALOG_IMPORT_CATEGORY_MISMATCH');
      return normalizeMenuItem(row, specsByItem.get(row.id) ?? [], existingMenuItems.find((item) => item.id === row.id));
    });

    const summary: CatalogImportSummary = {
      categories: countChanges(categories, existingCategories),
      stores: countChanges(stores, existingStores),
      menuItems: countChanges(menuItems, existingMenuItems),
      specRows: payload.specs?.length ?? 0,
    };
    const warnings: string[] = [];
    if (!payload.specs?.length) warnings.push('本次未提供规格表，全部菜品会按无规格商品导入。');
    if (!menuItems.some((item) => item.imageUrl)) warnings.push('本次没有菜品图片，导入后菜品将使用空图片。');
    return { categories, stores, menuItems, summary, warnings };
  }
}

export async function uploadCatalogImportImage(contentBase64: string): Promise<{ url: string; path: string; bytes: number }> {
  const { buffer, extension } = validateCatalogImage(contentBase64);
  const hash = createHash('sha256').update(buffer).digest('hex');
  const path = `${CATALOG_ASSET_PATH}/${hash}.${extension}`;
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  const uploaded = await cloud.uploadFile({ cloudPath: path, fileContent: buffer });
  if (!uploaded?.fileID) badRequest('商品图片上传失败', 'CATALOG_IMAGE_UPLOAD_FAILED');
  return { url: `${catalogImageCdnBaseUrl()}/${path}`, path, bytes: buffer.length };
}

export function validateCatalogImage(contentBase64: string): { buffer: Buffer; extension: 'jpg' | 'png' | 'webp' } {
  if (typeof contentBase64 !== 'string' || !contentBase64 || contentBase64.length > Math.ceil(MAX_CATALOG_IMAGE_BYTES * 4 / 3) + 8) {
    badRequest('商品图片不得超过 4MB', 'CATALOG_IMAGE_TOO_LARGE');
  }
  if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(contentBase64)) badRequest('商品图片数据格式不正确', 'INVALID_CATALOG_IMAGE');
  const buffer = Buffer.from(contentBase64, 'base64');
  if (!buffer.length || buffer.length > MAX_CATALOG_IMAGE_BYTES) badRequest('商品图片不得超过 4MB', 'CATALOG_IMAGE_TOO_LARGE');
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { buffer, extension: 'png' };
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { buffer, extension: 'jpg' };
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return { buffer, extension: 'webp' };
  badRequest('商品图片仅支持 JPEG、PNG 或 WebP', 'INVALID_CATALOG_IMAGE_TYPE');
}

function parseCatalogImportPayload(value: unknown): CatalogImportPayload {
  const input = record(value, '导入内容');
  const payload = {
    fileName: stringField(input.fileName, '文件名', 200),
    categories: array(input.categories, '分类').map(parseCategory),
    stores: array(input.stores, '店铺').map(parseStore),
    menuItems: array(input.menuItems, '菜品').map(parseMenuItem),
    specs: input.specs === undefined ? [] : array(input.specs, '规格').map(parseSpec),
  };
  if (!payload.categories.length || !payload.stores.length || !payload.menuItems.length) {
    badRequest('分类、店铺和菜品都至少需要一条数据', 'CATALOG_IMPORT_EMPTY');
  }
  return payload;
}

function parseCategory(value: unknown): CatalogImportCategoryInput {
  const input = record(value, '分类');
  return { id: stringField(input.id, '分类 ID', 80), name: stringField(input.name, '分类名称', 80), icon: stringField(input.icon, '分类图标', 80), sortOrder: integer(input.sortOrder, '分类排序', 0, 1_000_000) };
}

function parseStore(value: unknown): CatalogImportStoreInput {
  const input = record(value, '店铺');
  return {
    id: stringField(input.id, '店铺 ID', 80), categoryId: stringField(input.categoryId, '店铺分类 ID', 80), name: stringField(input.name, '店铺名称', 120), description: optionalString(input.description, '店铺简介', 500) ?? '', coverUrl: optionalImageUrl(input.coverUrl, '店铺封面'), tags: stringArray(input.tags, '店铺标签', 20, 30),
    deliveryFeeCents: integer(input.deliveryFeeCents, '配送费', 0, 100_000), packingFeeCents: integer(input.packingFeeCents, '包装费', 0, 100_000), minimumOrderCents: integer(input.minimumOrderCents, '起送金额', 0, 10_000_000), virtualDeliveryMinutes: integer(input.virtualDeliveryMinutes, '配送时间', 1, 24 * 60), monthlySales: integer(input.monthlySales, '月销量', 0, 100_000_000), distanceKm: finite(input.distanceKm, '距离', 0, 10_000), rating: finite(input.rating, '评分', 0, 5), recentViewers: integer(input.recentViewers, '最近浏览人数', 0, 100_000_000), systemHeat: integer(input.systemHeat, '系统热度', 0, 100_000_000), sourceType: stringField(input.sourceType, '来源类型', 30), sortOrder: integer(input.sortOrder, '店铺排序', 0, 1_000_000), status: status(input.status),
  };
}

function parseMenuItem(value: unknown): CatalogImportMenuItemInput {
  const input = record(value, '菜品');
  return {
    id: stringField(input.id, '菜品 ID', 80), storeId: stringField(input.storeId, '所属店铺 ID', 80), categoryId: stringField(input.categoryId, '菜品分类 ID', 80), subCategoryId: optionalString(input.subCategoryId, '菜品子分类 ID', 80), name: stringField(input.name, '菜品名称', 120), subtitle: optionalString(input.subtitle, '菜品副标题', 500), imageUrl: optionalImageUrl(input.imageUrl, '菜品图片'), basePriceCents: integer(input.basePriceCents, '菜品价格', 0, 10_000_000), caloriesKcal: integer(input.caloriesKcal, '菜品热量', 0, 100_000), calorieSource: structured(input.calorieSource ?? { type: 'composition_estimate', description: '后台导入', referenceUrl: '' }, '热量来源', 16_384), monthlySales: integer(input.monthlySales, '菜品月销量', 0, 100_000_000), sourceType: stringField(input.sourceType, '来源类型', 30), sortOrder: integer(input.sortOrder, '菜品排序', 0, 1_000_000), status: status(input.status),
  };
}

function parseSpec(value: unknown): CatalogImportSpecInput {
  const input = record(value, '规格');
  const minSelect = integer(input.minSelect, '规格最少选择数', 0, 20);
  const maxSelect = integer(input.maxSelect, '规格最多选择数', minSelect, 20);
  return { menuItemId: stringField(input.menuItemId, '规格菜品 ID', 80), groupId: stringField(input.groupId, '规格组 ID', 80), groupName: stringField(input.groupName, '规格组名称', 80), required: booleanField(input.required, '规格是否必选'), minSelect, maxSelect, optionId: stringField(input.optionId, '规格选项 ID', 80), optionName: stringField(input.optionName, '规格选项名称', 80), priceDeltaCents: integer(input.priceDeltaCents, '规格加价', -10_000_000, 10_000_000), calorieDeltaKcal: integer(input.calorieDeltaKcal, '规格热量变化', -100_000, 100_000), isDefault: booleanField(input.isDefault, '规格默认值') };
}

function normalizeStore(input: CatalogImportStoreInput, existing: StoreDoc | undefined): StoreDoc {
  const now = new Date().toISOString();
  return { ...existing, ...input, _id: input.id, id: input.id, createdAt: existing?.createdAt ?? now, updatedAt: now };
}

function normalizeMenuItem(input: CatalogImportMenuItemInput, specGroups: SpecGroup[], existing: MenuItemDoc | undefined): MenuItemDoc {
  const now = new Date().toISOString();
  return { ...existing, ...input, specGroups, _id: input.id, id: input.id, createdAt: existing?.createdAt ?? now, updatedAt: now };
}

function buildSpecGroups(rows: CatalogImportSpecInput[]): Map<string, SpecGroup[]> {
  const groupsByItem = new Map<string, Map<string, SpecGroup>>();
  for (const row of rows) {
    const itemGroups = groupsByItem.get(row.menuItemId) ?? new Map<string, SpecGroup>();
    const group = itemGroups.get(row.groupId) ?? { id: `${row.menuItemId}:${row.groupId}`, name: row.groupName, required: row.required, minSelect: row.minSelect, maxSelect: row.maxSelect, options: [] };
    if (group.name !== row.groupName || group.required !== row.required || group.minSelect !== row.minSelect || group.maxSelect !== row.maxSelect) badRequest(`菜品“${row.menuItemId}”的规格组“${row.groupId}”定义不一致`, 'CATALOG_IMPORT_SPEC_GROUP_INVALID');
    if (row.isDefault && group.options.some((option) => option.isDefault)) badRequest(`菜品“${row.menuItemId}”的规格组“${row.groupId}”只能有一个默认选项`, 'CATALOG_IMPORT_SPEC_DEFAULT_DUPLICATE');
    group.options.push({ id: `${row.menuItemId}:${row.groupId}:${row.optionId}`, name: row.optionName, priceDeltaCents: row.priceDeltaCents, calorieDeltaKcal: row.calorieDeltaKcal, isDefault: row.isDefault });
    itemGroups.set(row.groupId, group);
    groupsByItem.set(row.menuItemId, itemGroups);
  }
  return new Map([...groupsByItem.entries()].map(([itemId, groups]) => [itemId, [...groups.values()]]));
}

async function saveRowsWithSnapshots<T extends CategoryDoc | StoreDoc | MenuItemDoc>(
  db: Database,
  jobId: string,
  collectionName: string,
  resourceType: CatalogImportSnapshotDoc['resourceType'],
  rows: T[],
): Promise<void> {
  const collection = db.collection<T>(collectionName);
  const snapshots = db.collection<CatalogImportSnapshotDoc>(collections.catalogImportSnapshots);
  for (const row of rows) {
    const beforeData = await collection.get(row.id);
    const snapshotId = randomUUID();
    await snapshots.insert({ _id: snapshotId, id: snapshotId, jobId, resourceType, resourceId: row.id, beforeData, createdAt: db.now().toISOString() });
    await collection.upsert(row.id, row);
  }
}

async function restoreSnapshot(db: Database, snapshot: CatalogImportSnapshotDoc): Promise<void> {
  if (snapshot.resourceType === 'category') {
    const collection = db.collection<CategoryDoc>(collections.categories);
    if (snapshot.beforeData) await collection.upsert(snapshot.resourceId, snapshot.beforeData as CategoryDoc);
    else await collection.remove(snapshot.resourceId);
    return;
  }
  if (snapshot.resourceType === 'store') {
    const collection = db.collection<StoreDoc>(collections.stores);
    if (snapshot.beforeData) await collection.upsert(snapshot.resourceId, snapshot.beforeData as StoreDoc);
    else await collection.remove(snapshot.resourceId);
    return;
  }
  const collection = db.collection<MenuItemDoc>(collections.menuItems);
  if (snapshot.beforeData) await collection.upsert(snapshot.resourceId, snapshot.beforeData as MenuItemDoc);
  else await collection.remove(snapshot.resourceId);
}

function countChanges<T extends { id: string }>(rows: T[], existing: T[]): { created: number; updated: number } {
  const ids = new Set(existing.map((row) => row.id));
  return rows.reduce((summary, row) => ({ ...summary, [ids.has(row.id) ? 'updated' : 'created']: summary[ids.has(row.id) ? 'updated' : 'created'] + 1 }), { created: 0, updated: 0 });
}

function toJob(row: CatalogImportJobDoc): CatalogImportJob {
  return { id: row.id, fileName: row.fileName, status: row.status, summary: row.summary, adminUserId: row.adminUserId, createdAt: row.createdAt, rolledBackAt: row.rolledBackAt ?? null };
}

function catalogImageCdnBaseUrl(): string {
  const value = process.env.CATALOG_IMAGE_BASE_URL?.trim();
  if (!value || !/^https:\/\//.test(value)) badRequest('尚未配置商品图片 CDN 地址', 'CATALOG_IMAGE_CDN_MISSING');
  return value.replace(/\/+$/, '');
}

function ensureUnique<T>(rows: T[], name: string, key: (row: T) => string): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = key(row);
    if (seen.has(value)) badRequest(`${name} ID 重复：${value}`, 'CATALOG_IMPORT_DUPLICATE_ID');
    seen.add(value);
  }
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) badRequest(`${name}格式不正确`, 'CATALOG_IMPORT_INVALID');
  return value as Record<string, unknown>;
}

function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) badRequest(`${name}必须是数组`, 'CATALOG_IMPORT_INVALID');
  return value;
}

function stringField(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) badRequest(`${name}格式不正确`, 'CATALOG_IMPORT_INVALID');
  return value.trim();
}

function optionalString(value: unknown, name: string, max: number): string | null {
  if (value === null || value === undefined || value === '') return null;
  return stringField(value, name, max);
}

function optionalImageUrl(value: unknown, name: string): string | null {
  const url = optionalString(value, name, 1_000);
  if (url && !url.startsWith(`${catalogImageCdnBaseUrl()}/${CATALOG_ASSET_PATH}/`)) {
    badRequest(`${name}必须来自本系统的商品图片 CDN`, 'CATALOG_IMPORT_INVALID_IMAGE_URL');
  }
  return url;
}

function integer(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) badRequest(`${name}格式不正确`, 'CATALOG_IMPORT_INVALID');
  return value;
}

function finite(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) badRequest(`${name}格式不正确`, 'CATALOG_IMPORT_INVALID');
  return value;
}

function booleanField(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') badRequest(`${name}格式不正确`, 'CATALOG_IMPORT_INVALID');
  return value;
}

function stringArray(value: unknown, name: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== 'string' || !item.trim() || item.trim().length > maxLength)) badRequest(`${name}格式不正确`, 'CATALOG_IMPORT_INVALID');
  return value.map((item) => String(item).trim());
}

function structured(value: unknown, name: string, maxBytes: number): unknown {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || Buffer.byteLength(serialized, 'utf8') > maxBytes || /"(?:__proto__|prototype|constructor)"\s*:/.test(serialized)) badRequest(`${name}格式不正确`, 'CATALOG_IMPORT_INVALID');
    return JSON.parse(serialized) as unknown;
  } catch (error) {
    if (error instanceof CloudApiError) throw error;
    badRequest(`${name}格式不正确`, 'CATALOG_IMPORT_INVALID');
  }
}

function status(value: unknown): ManagedContentStatus {
  if (value === 'active' || value === 'inactive') return value;
  badRequest('上下架状态格式不正确', 'CATALOG_IMPORT_INVALID');
}

async function listAll<T extends object>(
  collection: { list(options?: ListOptions): Promise<T[]> },
  options: Omit<ListOptions, 'skip' | 'limit'> = {},
): Promise<T[]> {
  const rows: T[] = [];
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const page = await collection.list({ ...options, skip, limit: PAGE_SIZE });
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

interface NormalizedCatalogImport {
  categories: CategoryDoc[];
  stores: StoreDoc[];
  menuItems: MenuItemDoc[];
  summary: CatalogImportSummary;
  warnings: string[];
}
