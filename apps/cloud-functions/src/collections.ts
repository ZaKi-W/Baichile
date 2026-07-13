export const collections = {
  accounts: 'accounts',
  visitorSessions: 'visitor_sessions',
  addresses: 'addresses',
  categories: 'categories',
  stores: 'stores',
  storeSubCategories: 'store_sub_categories',
  menuItems: 'menu_items',
  virtualOrders: 'virtual_orders',
  walletTransactions: 'wallet_transactions',
  shareRewardConfigs: 'share_reward_configs',
  shareInvites: 'share_invites',
  analyticsEvents: 'analytics_events',
  adminUsers: 'admin_users',
  adminSessions: 'admin_sessions',
  adminAuditLogs: 'admin_audit_logs',
  rateLimits: 'rate_limits',
} as const;

export const collectionNames = Object.values(collections);

export interface CollectionSpec {
  name: string;
  indexes: Array<{
    name: string;
    fields: Record<string, 1 | -1>;
    unique?: boolean;
    sparse?: boolean;
  }>;
}

export const collectionSpecs: CollectionSpec[] = [
  { name: collections.accounts, indexes: [
    { name: 'wechat_openid_hash_unique', fields: { wechatOpenIdHash: 1 }, unique: true, sparse: true },
    { name: 'created_at_desc', fields: { createdAt: -1 } },
  ] },
  { name: collections.visitorSessions, indexes: [
    { name: 'visitor_id_unique', fields: { visitorId: 1 }, unique: true },
    { name: 'account_id', fields: { accountId: 1 } },
  ] },
  { name: collections.addresses, indexes: [
    { name: 'visitor_id_created', fields: { visitorId: 1, createdAt: 1 } },
    { name: 'account_id_created', fields: { accountId: 1, createdAt: 1 } },
  ] },
  { name: collections.categories, indexes: [
    { name: 'sort_order', fields: { sortOrder: 1 } },
  ] },
  { name: collections.stores, indexes: [
    { name: 'category_status_sort', fields: { categoryId: 1, status: 1, sortOrder: 1 } },
    { name: 'status_sort', fields: { status: 1, sortOrder: 1 } },
  ] },
  { name: collections.storeSubCategories, indexes: [
    { name: 'store_sub_unique', fields: { storeId: 1, subCategoryId: 1 }, unique: true },
    { name: 'store_sort', fields: { storeId: 1, sortOrder: 1 } },
  ] },
  { name: collections.menuItems, indexes: [
    { name: 'store_status_sort', fields: { storeId: 1, status: 1, sortOrder: 1 } },
    { name: 'category_id', fields: { categoryId: 1 } },
  ] },
  { name: collections.virtualOrders, indexes: [
    { name: 'account_created', fields: { accountId: 1, createdAt: -1 } },
    { name: 'visitor_created', fields: { visitorId: 1, createdAt: -1 } },
    { name: 'failed_refund', fields: { failedAt: 1, refundedAt: 1 } },
  ] },
  { name: collections.walletTransactions, indexes: [
    { name: 'account_created', fields: { accountId: 1, createdAt: -1 } },
    { name: 'daily_checkin_unique', fields: { accountId: 1, type: 1, businessDate: 1 }, unique: true, sparse: true },
    { name: 'order_refund_unique', fields: { orderId: 1, type: 1 }, unique: true, sparse: true },
  ] },
  { name: collections.shareRewardConfigs, indexes: [] },
  { name: collections.shareInvites, indexes: [
    { name: 'inviter_created', fields: { inviterAccountId: 1, createdAt: -1 } },
    { name: 'invitee_unique', fields: { inviteeAccountId: 1 }, unique: true, sparse: true },
    { name: 'expires_at', fields: { expiresAt: 1 } },
  ] },
  { name: collections.analyticsEvents, indexes: [
    { name: 'event_created', fields: { eventName: 1, createdAt: -1 } },
    { name: 'account_created', fields: { accountId: 1, createdAt: -1 } },
  ] },
  { name: collections.adminUsers, indexes: [
    { name: 'username_unique', fields: { username: 1 }, unique: true },
    { name: 'status_created', fields: { status: 1, createdAt: -1 } },
  ] },
  { name: collections.adminSessions, indexes: [
    { name: 'token_hash_unique', fields: { tokenHash: 1 }, unique: true },
    { name: 'admin_user_id', fields: { adminUserId: 1 } },
    { name: 'expires_at', fields: { expiresAt: 1 } },
  ] },
  { name: collections.adminAuditLogs, indexes: [
    { name: 'admin_created', fields: { adminUserId: 1, createdAt: -1 } },
    { name: 'action_created', fields: { action: 1, createdAt: -1 } },
    { name: 'resource_created', fields: { resourceType: 1, createdAt: -1 } },
  ] },
  { name: collections.rateLimits, indexes: [
    { name: 'expires_at', fields: { expiresAt: 1 } },
  ] },
];
