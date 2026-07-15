export type AdminRole = 'super_admin' | 'operator' | 'support';

export type AdminPermission =
  | 'dashboard:read'
  | 'catalog:read'
  | 'catalog:write'
  | 'accounts:read'
  | 'accounts:write'
  | 'wallet:read'
  | 'wallet:adjust'
  | 'orders:read'
  | 'orders:write'
  | 'admins:manage'
  | 'audit:read';

export type AdminUserStatus = 'active' | 'disabled';
export type ManagedContentStatus = 'active' | 'inactive';
export type AccountStatus = 'active' | 'disabled';
export type AdminOrderStatus = 'normal' | 'following_up' | 'resolved';

export interface AdminPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CatalogImportCategoryInput {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
}

export interface CatalogImportStoreInput {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  coverUrl?: string | null;
  tags: string[];
  deliveryFeeCents: number;
  packingFeeCents: number;
  minimumOrderCents: number;
  virtualDeliveryMinutes: number;
  monthlySales: number;
  distanceKm: number;
  rating: number;
  recentViewers: number;
  systemHeat: number;
  sourceType: string;
  sortOrder: number;
  status: ManagedContentStatus;
}

export interface CatalogImportMenuItemInput {
  id: string;
  storeId: string;
  categoryId: string;
  subCategoryId?: string | null;
  name: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  basePriceCents: number;
  caloriesKcal: number;
  calorieSource: unknown;
  monthlySales: number;
  sourceType: string;
  sortOrder: number;
  status: ManagedContentStatus;
}

export interface CatalogImportSpecInput {
  menuItemId: string;
  groupId: string;
  groupName: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  optionId: string;
  optionName: string;
  priceDeltaCents: number;
  calorieDeltaKcal: number;
  isDefault: boolean;
}

export interface CatalogImportPayload {
  fileName: string;
  categories: CatalogImportCategoryInput[];
  stores: CatalogImportStoreInput[];
  menuItems: CatalogImportMenuItemInput[];
  specs?: CatalogImportSpecInput[];
}

export interface CatalogImportCount {
  created: number;
  updated: number;
}

export interface CatalogImportSummary {
  categories: CatalogImportCount;
  stores: CatalogImportCount;
  menuItems: CatalogImportCount;
  specRows: number;
}

export interface CatalogImportPreview {
  summary: CatalogImportSummary;
  warnings: string[];
}

export interface CatalogImportJob {
  id: string;
  fileName: string;
  status: 'published' | 'rolled_back';
  summary: CatalogImportSummary;
  adminUserId: string;
  createdAt: string;
  rolledBackAt?: string | null;
}
