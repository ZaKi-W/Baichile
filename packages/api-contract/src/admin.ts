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

