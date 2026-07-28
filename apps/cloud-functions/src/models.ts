import type {
  AccountStatus,
  AdminOrderStatus,
  AdminRole,
  AdminUserStatus,
  CatalogImportSummary,
  CheckoutQuote,
  CheckoutQuoteRequest,
  GameplayConfig,
  ManagedContentStatus,
  PromotionCampaign,
  PromotionSnapshot,
  ShareKind,
  OrderEasterEgg,
  QuoteLine,
  ShareIdentity,
  SharePersona,
  SharePosterTheme,
  ShareMilestone,
  ShareRewardConfig,
  WalletTransactionType,
} from '@baichile/api-contract';

export interface AccountDoc {
  _id: string;
  id: string;
  wechatOpenIdHash?: string | null;
  webAuthUidHash?: string | null;
  phoneHash?: string | null;
  phoneNumber?: string | null;
  mergedIntoAccountId?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  balanceCents: number;
  status: AccountStatus;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VisitorSessionDoc {
  _id: string;
  id: string;
  visitorId: string;
  accountId?: string | null;
  accessTokenHash?: string | null;
  refreshTokenHash?: string | null;
  expiresAt?: string | null;
  refreshExpiresAt?: string | null;
  revokedAt?: string | null;
  rotatedFromId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface RateLimitDoc {
  _id: string;
  id: string;
  count: number;
  windowStartedAt: string;
  expiresAt: string;
  updatedAt: string;
}

export interface AddressDoc {
  _id: string;
  id: string;
  visitorId?: string | null;
  accountId?: string | null;
  name: string;
  phone: string;
  address: string;
  detail: string;
  tag: string;
  lat: number;
  lng: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryDoc {
  _id: string;
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
}

export interface StoreDoc {
  _id: string;
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
  searchText?: string;
  sortOrder: number;
  status: ManagedContentStatus;
  promotionPublishRevision?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoreSubCategoryDoc {
  _id: string;
  id: string;
  storeId: string;
  subCategoryId: string;
  name: string;
  sortOrder: number;
}

export interface MenuItemDoc {
  _id: string;
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
  status: ManagedContentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VirtualOrderDoc {
  _id: string;
  id: string;
  checkoutId?: string | null;
  quoteId?: string | null;
  idempotencyKey?: string | null;
  /** Immutable idempotency principal captured when the order was created. */
  subjectKey?: string | null;
  requestFingerprint?: string | null;
  legacyCreate?: boolean | null;
  visitorId?: string | null;
  accountId?: string | null;
  settlementMode?: 'guest_simulation' | 'virtual_balance' | null;
  status: string;
  storeId: string;
  storeName?: string | null;
  destinationId: string;
  deliveryAddress?: unknown;
  paymentMethod?: string | null;
  startedAt: string;
  durationMs: number;
  seed: string;
  itemsTotalCents: number;
  deliveryFeeCents: number;
  packingFeeCents: number;
  totalCents: number;
  itemsTotalCaloriesKcal: number;
  promotionDiscountCents?: number | null;
  promotionSnapshots?: PromotionSnapshot[];
  lines: unknown[];
  route: unknown;
  incidentKey?: string | null;
  incidentStartedAt?: string | null;
  failedAt?: string | null;
  refundedAt?: string | null;
  easterEgg?: OrderEasterEgg | null;
  adminStatus: AdminOrderStatus;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransactionDoc {
  _id: string;
  id: string;
  accountId: string;
  type: WalletTransactionType;
  amountCents: number;
  balanceAfterCents: number;
  orderId?: string | null;
  description: string;
  businessDate?: string | null;
  createdAt: string;
}

export interface ShareConfigDoc {
  _id: 'default';
  id: 'default';
  config: ShareRewardConfig;
  updatedAt: string;
}

export interface ShareInviteDoc {
  _id: string;
  token: string;
  inviterAccountId: string;
  kind: ShareKind;
  orderId?: string | null;
  title: string;
  snapshot: {
    identity?: ShareIdentity;
    storeName?: string;
    orderLines?: QuoteLine[];
    dishNames: string[];
    savedMoneyCents: number;
    savedCaloriesKcal: number;
    completedOrderCount: number;
    persona?: SharePersona;
    milestone?: ShareMilestone;
    easterEgg?: OrderEasterEgg;
    miniProgramCodeUrl?: string;
    posterTheme?: SharePosterTheme;
  };
  initiatedRewardGranted: boolean;
  initiatedRewardGrantedAt?: string | null;
  rewardedAt?: string | null;
  rewardBusinessDate?: string | null;
  rewardMigrationReviewRequired?: boolean;
  rewardMigrationGuardBusinessDate?: string | null;
  inviteeAccountId?: string | null;
  completedAt?: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface ShareRewardDailyDoc {
  _id: string;
  id: string;
  accountId: string;
  businessDate: string;
  grantedCount: number;
  totalAmountCents: number;
  migrationGuardedUnknownCount?: number;
  updatedAt: string;
}

export interface GameplayConfigDoc extends GameplayConfig {
  _id: 'default';
}

export interface PromotionCampaignDoc extends PromotionCampaign {
  _id: string;
}

export interface CheckoutSessionDoc {
  _id: string;
  id: string;
  quoteId: string;
  subjectKey: string;
  visitorId?: string | null;
  accountId?: string | null;
  request: CheckoutQuoteRequest;
  quote: CheckoutQuote;
  quotedAt: string;
  expiresAt: string;
  checkoutExpiresAt: string;
  firstCheckout: boolean;
  createdOrderIds: string[];
  createdStoreIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsEventDoc {
  _id: string;
  id: string;
  visitorId?: string | null;
  accountId?: string | null;
  eventName: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AdminUserDoc {
  _id: string;
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: AdminRole;
  status: AdminUserStatus;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSessionDoc {
  _id: string;
  id: string;
  adminUserId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt?: string | null;
  createdAt: string;
}

export interface AdminAuditLogDoc {
  _id: string;
  id: string;
  adminUserId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  ipAddress?: string | null;
  createdAt: string;
}

export interface CatalogImportJobDoc {
  _id: string;
  id: string;
  fileName: string;
  status: 'published' | 'rolled_back';
  summary: CatalogImportSummary;
  adminUserId: string;
  createdAt: string;
  rolledBackAt?: string | null;
}

export interface CatalogImportSnapshotDoc {
  _id: string;
  id: string;
  jobId: string;
  resourceType: 'category' | 'store' | 'menu_item';
  resourceId: string;
  beforeData: CategoryDoc | StoreDoc | MenuItemDoc | null;
  createdAt: string;
}
