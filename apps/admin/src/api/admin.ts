import type {
  AdminPage,
  AdminPermission,
  AdminRole,
  AdminUserStatus,
  CatalogImportJob,
  CatalogImportPayload,
  CatalogImportPreview,
  ShareRewardConfig,
} from '@baichile/api-contract';
import { api, toQuery } from './http';

export interface AdminIdentity {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  permissions: AdminPermission[];
}

export interface AdminUser extends AdminIdentity {
  status: AdminUserStatus;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface StoreRecord {
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
  status: 'active' | 'inactive';
}

export interface MenuItemRecord {
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
  specGroups: unknown[];
  sourceType: string;
  sortOrder: number;
  status: 'active' | 'inactive';
}

export interface AccountRecord {
  id: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  balanceCents: number;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
  orderCount?: number;
}

export interface OrderRecord {
  id: string;
  accountId?: string | null;
  storeId: string;
  status: string;
  adminStatus: 'normal' | 'following_up' | 'resolved';
  adminNote: string;
  totalCents: number;
  itemsTotalCents: number;
  deliveryFeeCents: number;
  packingFeeCents: number;
  itemsTotalCaloriesKcal: number;
  lines: unknown[];
  createdAt: string;
  startedAt: string;
  incidentKey?: string | null;
  refundedAt?: string | null;
}

export interface WalletTransactionRecord {
  id: string;
  type: string;
  amountCents: number;
  balanceAfterCents: number;
  description: string;
  createdAt: string;
}

export interface CatalogAssetUploadResult {
  url: string;
  path: string;
  bytes: number;
}

export function menuItemCollectionPath(storeId: string): string {
  return `/v1/admin/stores/${encodeURIComponent(storeId)}/menu-items`;
}

export function menuItemPath(storeId: string, itemId: string): string {
  return `${menuItemCollectionPath(storeId)}/${encodeURIComponent(itemId)}`;
}

export function menuItemTransferPath(storeId: string, itemId: string): string {
  return `${menuItemPath(storeId, itemId)}/transfer`;
}

export const adminApi = {
  login: (username: string, password: string) =>
    api<{ accessToken: string; admin: AdminIdentity; expiresAt: string }>('/v1/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  me: () => api<AdminIdentity>('/v1/admin/auth/me'),
  logout: () => api<{ success: true }>('/v1/admin/auth/logout', { method: 'POST' }),
  dashboard: () => api<Record<string, any>>('/v1/admin/dashboard'),

  listStores: (query: Record<string, any>) =>
    api<AdminPage<StoreRecord>>(`/v1/admin/stores${toQuery(query)}`),
  store: (id: string) => api<StoreRecord>(`/v1/admin/stores/${id}`),
  saveStore: (record: StoreRecord, create: boolean) =>
    api<StoreRecord>(create ? '/v1/admin/stores' : `/v1/admin/stores/${record.id}`, {
      method: create ? 'POST' : 'PATCH',
      body: JSON.stringify(record),
    }),
  listMenuItems: (storeId: string, query: Record<string, any>) =>
    api<AdminPage<MenuItemRecord>>(`${menuItemCollectionPath(storeId)}${toQuery(query)}`),
  saveMenuItem: (storeId: string, record: MenuItemRecord, create: boolean) =>
    api<MenuItemRecord>(create
      ? menuItemCollectionPath(storeId)
      : menuItemPath(storeId, record.id), {
      method: create ? 'POST' : 'PATCH',
      body: JSON.stringify(Object.fromEntries(
        Object.entries(record).filter(([key]) => key !== 'storeId'),
      )),
    }),
  transferMenuItem: (storeId: string, itemId: string, targetStoreId: string) =>
    api<MenuItemRecord>(menuItemTransferPath(storeId, itemId), {
      method: 'POST',
      body: JSON.stringify({ targetStoreId }),
    }),
  catalogImportJobs: () => api<CatalogImportJob[]>('/v1/admin/catalog-imports'),
  uploadCatalogAsset: (contentBase64: string) =>
    api<CatalogAssetUploadResult>('/v1/admin/catalog-imports/assets', {
      method: 'POST',
      body: JSON.stringify({ contentBase64 }),
    }),
  previewCatalogImport: (payload: CatalogImportPayload) =>
    api<CatalogImportPreview>('/v1/admin/catalog-imports/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  publishCatalogImport: (payload: CatalogImportPayload) =>
    api<CatalogImportJob>('/v1/admin/catalog-imports/publish', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  rollbackCatalogImport: (id: string) =>
    api<CatalogImportJob>(`/v1/admin/catalog-imports/${encodeURIComponent(id)}/rollback`, {
      method: 'POST',
    }),
  listAccounts: (query: Record<string, any>) =>
    api<AdminPage<AccountRecord>>(`/v1/admin/accounts${toQuery(query)}`),
  account: (id: string) => api<AccountRecord>(`/v1/admin/accounts/${id}`),
  updateAccount: (id: string, body: Pick<AccountRecord, 'nickname' | 'status'>) =>
    api<AccountRecord>(`/v1/admin/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  wallet: (id: string, query: Record<string, any>) =>
    api<{ account: AccountRecord; transactions: AdminPage<WalletTransactionRecord> }>(
      `/v1/admin/accounts/${id}/wallet${toQuery(query)}`,
    ),
  adjustWallet: (id: string, amountCents: number, reason: string) =>
    api(`/v1/admin/accounts/${id}/wallet/adjustments`, {
      method: 'POST',
      body: JSON.stringify({ amountCents, reason }),
    }),
  listOrders: (query: Record<string, any>) =>
    api<AdminPage<OrderRecord>>(`/v1/admin/orders${toQuery(query)}`),
  order: (id: string) => api<OrderRecord & { account?: AccountRecord; store?: StoreRecord }>(`/v1/admin/orders/${id}`),
  updateOrder: (id: string, body: Pick<OrderRecord, 'adminStatus' | 'adminNote'>) =>
    api<OrderRecord>(`/v1/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  listAdminUsers: (query: Record<string, any>) =>
    api<AdminPage<AdminUser>>(`/v1/admin/admin-users${toQuery(query)}`),
  createAdmin: (body: { username: string; displayName: string; password: string; role: AdminRole }) =>
    api<AdminUser>('/v1/admin/admin-users', { method: 'POST', body: JSON.stringify(body) }),
  updateAdmin: (id: string, body: Partial<Pick<AdminUser, 'displayName' | 'role' | 'status'>>) =>
    api<AdminUser>(`/v1/admin/admin-users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  resetAdminPassword: (id: string, password: string) =>
    api(`/v1/admin/admin-users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  auditLogs: (query: Record<string, any>) =>
    api<AdminPage<Record<string, any>>>(`/v1/admin/audit-logs${toQuery(query)}`),
  shareRewardConfig: () => api<ShareRewardConfig>('/v1/admin/share-rewards/config'),
  updateShareRewardConfig: (config: ShareRewardConfig) =>
    api<ShareRewardConfig>('/v1/admin/share-rewards/config', {
      method: 'PATCH',
      body: JSON.stringify(config),
    }),
};
