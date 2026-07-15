import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import type {
  CatalogImportCategoryInput,
  CatalogImportMenuItemInput,
  CatalogImportPayload,
  CatalogImportSpecInput,
  CatalogImportStoreInput,
} from '@baichile/api-contract';

export interface CatalogImportBundle {
  fileName: string;
  payload: CatalogImportPayload;
  imageAssets: Map<string, ArrayBuffer>;
  imagePaths: string[];
}

type SpreadsheetRow = Record<string, unknown>;

export async function parseCatalogImportZip(file: File): Promise<CatalogImportBundle> {
  if (!file.name.toLowerCase().endsWith('.zip')) throw new Error('请上传包含 catalog.xlsx 和 images 目录的 ZIP 文件');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const workbookEntry = Object.values(zip.files).find((entry) => !entry.dir && basename(entry.name).toLowerCase() === 'catalog.xlsx');
  if (!workbookEntry) throw new Error('压缩包中未找到 catalog.xlsx');
  const workbook = XLSX.read(await workbookEntry.async('array'), { type: 'array' });
  const categories = readRows(workbook, '分类').map(parseCategory);
  const stores = readRows(workbook, '店铺').map(parseStore);
  const menuItems = readRows(workbook, '菜品').map(parseMenuItem);
  const specs = workbook.SheetNames.includes('规格') ? readRows(workbook, '规格').map(parseSpec) : [];
  if (!categories.length || !stores.length || !menuItems.length) throw new Error('分类、店铺、菜品工作表都至少需要一条数据');
  const imageAssets = new Map<string, ArrayBuffer>();
  for (const entry of Object.values(zip.files)) {
    const path = normalizeZipPath(entry.name);
    if (!entry.dir && path.startsWith('images/')) imageAssets.set(path, await entry.async('arraybuffer'));
  }
  const imagePaths = [...new Set([...stores.map((row) => row.coverUrl), ...menuItems.map((row) => row.imageUrl)]
    .filter((path): path is string => Boolean(path)))];
  for (const path of imagePaths) {
    if (!imageAssets.has(path)) throw new Error(`表格引用的图片不存在：${path}`);
  }
  return {
    fileName: file.name,
    payload: { fileName: file.name, categories, stores, menuItems, specs },
    imageAssets,
    imagePaths,
  };
}

export function applyCatalogAssetUrls(bundle: CatalogImportBundle, assetUrls: Map<string, string>): CatalogImportPayload {
  const payload = structuredClone(bundle.payload);
  payload.stores = payload.stores.map((store) => ({ ...store, coverUrl: store.coverUrl ? requireAssetUrl(store.coverUrl, assetUrls) : null }));
  payload.menuItems = payload.menuItems.map((item) => ({ ...item, imageUrl: item.imageUrl ? requireAssetUrl(item.imageUrl, assetUrls) : null }));
  return payload;
}

export function arrayBufferToBase64(value: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('读取图片失败'));
        return;
      }
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(new Blob([value]));
  });
}

export function downloadCatalogImportTemplate(): void {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
    category_id: 'bbq', name: '烧烤', icon: 'bbq', sort_order: 10,
  }]), '分类');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
    store_id: 'store-haochi-bbq', category_id: 'bbq', name: '好吃烧烤', description: '现烤烧烤', cover_image_path: 'images/stores/haochi-bbq.webp', tags: '夜宵,烧烤', delivery_fee_yuan: 3, packing_fee_yuan: 1, minimum_order_yuan: 20, virtual_delivery_minutes: 30, monthly_sales: 100, distance_km: 1.2, rating: 4.8, recent_viewers: 5, system_heat: 10, source_type: 'original', sort_order: 10, status: 'active',
  }]), '店铺');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
    menu_item_id: 'item-haochi-lamb', store_id: 'store-haochi-bbq', category_id: 'bbq', sub_category_id: '', name: '羊肉串', subtitle: '现烤现出炉', image_path: 'images/menu/haochi-lamb.webp', price_yuan: 3.5, calories_kcal: 130, calorie_source_type: 'composition_estimate', calorie_source_description: '后台导入', calorie_reference_url: '', monthly_sales: 50, source_type: 'original', sort_order: 10, status: 'active',
  }]), '菜品');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
    menu_item_id: 'item-haochi-lamb', group_id: 'spicy', group_name: '辣度', required: false, min_select: 0, max_select: 1, option_id: 'mild', option_name: '微辣', price_delta_yuan: 0, calorie_delta_kcal: 0, is_default: true,
  }]), '规格');
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const url = URL.createObjectURL(new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'catalog.xlsx';
  anchor.click();
  URL.revokeObjectURL(url);
}

function readRows(workbook: XLSX.WorkBook, sheetName: string): SpreadsheetRow[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`缺少“${sheetName}”工作表`);
  return XLSX.utils.sheet_to_json<SpreadsheetRow>(sheet, { defval: '' });
}

function parseCategory(row: SpreadsheetRow): CatalogImportCategoryInput {
  return { id: text(row, 'category_id'), name: text(row, 'name'), icon: text(row, 'icon'), sortOrder: integer(row, 'sort_order') };
}

function parseStore(row: SpreadsheetRow): CatalogImportStoreInput {
  return {
    id: text(row, 'store_id'), categoryId: text(row, 'category_id'), name: text(row, 'name'), description: text(row, 'description', true), coverUrl: text(row, 'cover_image_path', true) || null, tags: text(row, 'tags', true).split(/[，,]/).map((tag) => tag.trim()).filter(Boolean), deliveryFeeCents: yuanToCents(row, 'delivery_fee_yuan'), packingFeeCents: yuanToCents(row, 'packing_fee_yuan'), minimumOrderCents: yuanToCents(row, 'minimum_order_yuan'), virtualDeliveryMinutes: integer(row, 'virtual_delivery_minutes'), monthlySales: integer(row, 'monthly_sales'), distanceKm: number(row, 'distance_km'), rating: number(row, 'rating'), recentViewers: integer(row, 'recent_viewers'), systemHeat: integer(row, 'system_heat'), sourceType: text(row, 'source_type'), sortOrder: integer(row, 'sort_order'), status: status(row),
  };
}

function parseMenuItem(row: SpreadsheetRow): CatalogImportMenuItemInput {
  return {
    id: text(row, 'menu_item_id'), storeId: text(row, 'store_id'), categoryId: text(row, 'category_id'), subCategoryId: text(row, 'sub_category_id', true) || null, name: text(row, 'name'), subtitle: text(row, 'subtitle', true) || null, imageUrl: text(row, 'image_path', true) || null, basePriceCents: yuanToCents(row, 'price_yuan'), caloriesKcal: integer(row, 'calories_kcal'), calorieSource: { type: text(row, 'calorie_source_type', true) || 'composition_estimate', description: text(row, 'calorie_source_description', true) || '后台导入', referenceUrl: text(row, 'calorie_reference_url', true) }, monthlySales: integer(row, 'monthly_sales'), sourceType: text(row, 'source_type'), sortOrder: integer(row, 'sort_order'), status: status(row),
  };
}

function parseSpec(row: SpreadsheetRow): CatalogImportSpecInput {
  return {
    menuItemId: text(row, 'menu_item_id'), groupId: text(row, 'group_id'), groupName: text(row, 'group_name'), required: boolean(row, 'required'), minSelect: integer(row, 'min_select'), maxSelect: integer(row, 'max_select'), optionId: text(row, 'option_id'), optionName: text(row, 'option_name'), priceDeltaCents: yuanToCents(row, 'price_delta_yuan'), calorieDeltaKcal: integer(row, 'calorie_delta_kcal'), isDefault: boolean(row, 'is_default'),
  };
}

function text(row: SpreadsheetRow, name: string, optional = false): string {
  const value = row[name];
  if (value === undefined || value === null || String(value).trim() === '') {
    if (optional) return '';
    throw new Error(`缺少“${name}”列的值`);
  }
  return String(value).trim();
}

function number(row: SpreadsheetRow, name: string): number {
  const value = Number(row[name]);
  if (!Number.isFinite(value)) throw new Error(`“${name}”必须是数字`);
  return value;
}

function integer(row: SpreadsheetRow, name: string): number {
  const value = number(row, name);
  if (!Number.isSafeInteger(value)) throw new Error(`“${name}”必须是整数`);
  return value;
}

function yuanToCents(row: SpreadsheetRow, name: string): number {
  return Math.round(number(row, name) * 100);
}

function boolean(row: SpreadsheetRow, name: string): boolean {
  const value = row[name];
  if (value === true || value === 1 || String(value).trim().toLowerCase() === 'true' || String(value).trim() === '是') return true;
  if (value === false || value === 0 || String(value).trim().toLowerCase() === 'false' || String(value).trim() === '否') return false;
  throw new Error(`“${name}”必须填写 true/false 或 是/否`);
}

function status(row: SpreadsheetRow): 'active' | 'inactive' {
  const value = text(row, 'status').toLowerCase();
  if (value === 'active' || value === '上架') return 'active';
  if (value === 'inactive' || value === '下架') return 'inactive';
  throw new Error('“status”只能填写 active/inactive 或 上架/下架');
}

function normalizeZipPath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\\/g, '/');
}

function basename(path: string): string {
  return normalizeZipPath(path).split('/').at(-1) ?? path;
}

function requireAssetUrl(path: string, assetUrls: Map<string, string>): string {
  const url = assetUrls.get(path);
  if (!url) throw new Error(`图片尚未上传：${path}`);
  return url;
}
