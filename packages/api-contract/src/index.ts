import type { SpecGroup } from '@baichile/domain';
import type { DeliveryIncidentAssignment } from '@baichile/domain';
import type { DeliveryStatus, VirtualRoute } from '@baichile/map-core';
export * from './admin';

export type SourceType = 'original' | 'licensed' | 'authorized' | 'derived';

export interface Category {
  id: string;
  name: string;
  icon: string;
}

export interface MenuItem {
  id: string;
  storeId: string;
  categoryId: string;
  subCategoryId?: string;
  name: string;
  subtitle?: string;
  imageUrl?: string;
  basePriceCents: number;
  caloriesKcal: number;
  calorieSource: CalorieSource;
  monthlySales: number;
  specGroups: SpecGroup[];
  sourceType: SourceType;
}

export interface CalorieSource {
  type: 'official' | 'composition_estimate';
  description: string;
  referenceUrl: string;
}

export interface MenuSubCategory {
  id: string;
  name: string;
}

export interface StoreSummary {
  id: string;
  name: string;
  categoryId: string;
  description: string;
  coverUrl?: string;
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
  sourceType: SourceType;
}

export interface StoreDetail extends StoreSummary {
  menu: MenuItem[];
  subCategories?: MenuSubCategory[];
  /** Active published item promotions for this store; optional for one-release compatibility. */
  flashSaleItems?: FlashSaleItem[];
  /** Active published threshold promotions for this store; optional for one-release compatibility. */
  storePromotions?: StorePromotion[];
}

export interface FlashSaleItem {
  promotionId: string;
  menuItemId: string;
  storeId: string;
  subCategoryId?: string;
  storeName: string;
  name: string;
  imageUrl?: string;
  originalPriceCents: number;
  flashPriceCents: number;
  startsAt: string;
  endsAt: string;
}

export interface StorePromotion {
  promotionId: string;
  storeId: string;
  name: string;
  tiers: PromotionThresholdTier[];
  startsAt: string;
  endsAt: string;
}

export interface HomeResponse {
  categories: Category[];
  featured: StoreSummary[];
  flashSaleItems: FlashSaleItem[];
  storePromotions: StorePromotion[];
  stores: StoreSummary[];
  nextCursor: string | null;
}

export interface OrderLineInput {
  menuItemId: string;
  optionIds: string[];
  quantity: number;
}

export interface QuoteRequest {
  storeId: string;
  lines: OrderLineInput[];
  virtualDestinationId: string;
  virtualDestinationPoint?: import('@baichile/map-core').GeoPoint;
  deliveryAddressSnapshot?: OrderDeliveryAddressSnapshot;
}

/**
 * The legacy single-store create endpoint accepts the quote fields directly.
 * New clients should include all three checkout identifiers returned by
 * `POST /v1/checkouts/quote`.
 */
export interface OrderCreateRequest extends QuoteRequest {
  checkoutId?: string;
  quoteId?: string;
  idempotencyKey?: string;
}

export interface CheckoutStoreRequest {
  storeId: string;
  lines: OrderLineInput[];
}

export interface CheckoutQuoteRequest {
  checkoutId?: string;
  stores: CheckoutStoreRequest[];
  virtualDestinationId: string;
  virtualDestinationPoint?: import('@baichile/map-core').GeoPoint;
  deliveryAddressSnapshot?: OrderDeliveryAddressSnapshot;
}

export interface OrderDeliveryAddressSnapshot {
  name: string;
  phone: string;
  address: string;
  detail: string;
  tag: string;
}

export interface QuoteLine {
  menuItemId: string;
  name: string;
  imageUrl?: string;
  optionNames: string[];
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  unitCaloriesKcal: number;
  totalCaloriesKcal: number;
}

export interface OrderQuote {
  storeId: string;
  lines: QuoteLine[];
  itemsTotalCents: number;
  deliveryFeeCents: number;
  packingFeeCents: number;
  totalCents: number;
  itemsTotalCaloriesKcal: number;
}

export type PromotionType = 'item_flash' | 'store_threshold';
export type PromotionLifecycleStatus = 'draft' | 'published' | 'paused';

export interface PromotionThresholdTier {
  thresholdCents: number;
  discountCents: number;
}

export interface PromotionCampaign {
  id: string;
  name: string;
  type: PromotionType;
  storeId: string;
  menuItemId?: string;
  flashPriceCents?: number;
  tiers?: PromotionThresholdTier[];
  startsAt: string;
  endsAt: string;
  lifecycleStatus: PromotionLifecycleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GameplayConfig {
  id: 'default';
  firstCheckoutGuaranteed: boolean;
  deliveryIncidentRate: number;
  successEggRate: number;
  updatedAt: string;
}

export interface PromotionSnapshot {
  promotionId: string;
  name: string;
  type: PromotionType;
  storeId: string;
  menuItemId?: string;
  originalPriceCents?: number;
  appliedPriceCents?: number;
  thresholdCents?: number;
  discountCents: number;
  startsAt: string;
  endsAt: string;
}

export interface CheckoutStoreQuote extends OrderQuote {
  storeName: string;
  originalItemsTotalCents: number;
  minimumOrderCents: number;
  minimumOrderShortfallCents: number;
  flashDiscountCents: number;
  storeDiscountCents: number;
  promotionDiscountCents: number;
  promotionSnapshots: PromotionSnapshot[];
}

export interface CheckoutQuote {
  checkoutId: string;
  quoteId: string;
  quotedAt: string;
  expiresAt: string;
  checkoutExpiresAt: string;
  stores: CheckoutStoreQuote[];
  originalItemsTotalCents: number;
  itemsTotalCents: number;
  deliveryFeeCents: number;
  packingFeeCents: number;
  minimumOrderShortfallCents: number;
  flashDiscountCents: number;
  storeDiscountCents: number;
  promotionDiscountCents: number;
  totalCents: number;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * @deprecated Kept for one client release. Prefer `AccountGameStats`.
 */
export interface AccountSavings {
  savedMoneyCents: number;
  savedCaloriesKcal: number;
  completedOrderCount: number;
  deprecated?: true;
  replacement?: '/v1/accounts/me/game-stats';
}

export interface AccountGameStats {
  totalOrderCount: number;
  completedOrderCount: number;
  failedOrderCount: number;
  simulatedOrderAmountCents: number;
  simulatedCaloriesKcal: number;
  firstOrderAt?: string;
  lastOrderAt?: string;
}

export type WalletTransactionType =
  | 'initial_grant'
  | 'daily_checkin'
  | 'order_payment'
  | 'test_credit'
  | 'order_refund'
  | 'admin_adjustment'
  | 'share_initiated'
  | 'referral_inviter'
  | 'referral_invitee';

/**
 * `invitation` is kept for shares generated before the dedicated reward page.
 * New reward links must use `reward`.
 */
export type ShareKind = 'order' | 'order_egg' | 'persona' | 'achievement' | 'invitation' | 'reward';

export type SharePosterTheme = 'order' | 'order_egg' | 'persona' | 'achievement' | 'reward';

export type EasterEggRarity = 'common' | 'rare' | 'legendary';

export interface OrderEasterEgg {
  id: string;
  name: string;
  rarity: EasterEggRarity;
  verdict: string;
  themeColor: string;
  decoration: string;
  collectionNumber: string;
  triggeredAt: string;
}

export interface ShareIdentity {
  nickname: string;
  avatarUrl: string;
}

export interface SharePersona {
  id: string;
  acronym: string;
  name: string;
  verdict: string;
  callToAction: string;
  description: string;
  imageUrl: string;
}

export interface ShareMilestone {
  id: string;
  title: string;
  stamp: string;
}

export interface ShareRewardConfig {
  enabled: boolean;
  initiatedRewardCents: number;
  inviterRewardCents: number;
  inviteeRewardCents: number;
  dailyInitiatedLimit: number;
  orderTitles: string[];
  achievementTitles: string[];
  invitationTitles: string[];
}

export interface ShareCreateRequest {
  kind: ShareKind;
  orderId?: string;
  showIdentity?: boolean;
}

export interface ShareCard {
  token: string;
  kind: ShareKind;
  title: string;
  path: string;
  imageUrl?: string;
  initiatedRewardCents: number;
  initiatedRewardGranted: boolean;
}

export interface ShareRewardResult {
  granted: boolean;
  amountCents: number;
  balanceCents: number;
  rewardedAt?: string;
  businessDate?: string;
}

export interface ShareLanding {
  active: boolean;
  expired?: boolean;
  kind?: ShareKind;
  title?: string;
  identity?: ShareIdentity;
  storeName?: string;
  orderLines?: QuoteLine[];
  dishNames: string[];
  savedMoneyCents: number;
  savedCaloriesKcal: number;
  completedOrderCount: number;
  inviteeRewardCents: number;
  benefitText: string;
  persona?: SharePersona;
  milestone?: ShareMilestone;
  easterEgg?: OrderEasterEgg;
  miniProgramCodeUrl?: string;
  posterTheme?: SharePosterTheme;
}

export interface WalletSummary {
  balanceCents: number;
  checkedInToday: boolean;
  notice?: string;
}

export interface WalletTransaction {
  id: string;
  type: WalletTransactionType;
  amountCents: number;
  balanceAfterCents: number;
  orderId?: string;
  description: string;
  createdAt: string;
}

export interface VirtualOrder extends OrderQuote {
  id: string;
  isVirtual: true;
  checkoutId?: string;
  quoteId?: string;
  idempotencyKey?: string;
  visitorId?: string;
  accountId?: string;
  settlementMode: 'guest_simulation' | 'virtual_balance';
  virtualDestinationId: string;
  storeName?: string;
  deliveryAddress?: OrderDeliveryAddressSnapshot;
  paymentMethod?: 'virtual_balance';
  status: DeliveryStatus;
  startedAt: string;
  createdAt: string;
  durationMs: number;
  seed: string;
  route: VirtualRoute;
  incident?: DeliveryIncidentAssignment;
  failedAt?: string;
  refundStatus?: 'pending' | 'refunded';
  promotionDiscountCents?: number;
  promotionSnapshots?: PromotionSnapshot[];
  fundsNotice?: string;
  easterEgg?: OrderEasterEgg;
}

export interface GuestSession {
  visitorId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
}

export interface UserProfile {
  avatarUrl: string;
  nickname: string;
}

export interface WechatMiniLoginRequest {
  code: string;
  visitorId?: string;
  profile: UserProfile;
  referralToken?: string;
}

export interface AccountSession {
  accountId: string;
  accessToken: string;
  provider: 'wechat' | 'phone' | 'dev-mock';
  profile: UserProfile;
}

export interface WechatPhoneRequest {
  code: string;
}

export interface WechatPhoneResult {
  phoneNumber: string;
  purePhoneNumber: string;
  countryCode: string;
}

export interface AccountMergeSummary {
  orders: number;
  visitorSessions: number;
  addresses: number;
  walletTransactions: number;
  shareInvites: number;
  analyticsEvents: number;
}

export interface WechatPhoneBindResult {
  session: AccountSession;
  phoneNumber: string;
  merged: boolean;
  migrated: AccountMergeSummary;
}

export interface AdministrativeArea {
  province: string;
  city: string;
  district: string;
  address?: string;
  adcode: string;
  cityCode: string;
  districtCode: string;
}

export interface Address {
  id: string;
  name: string;
  phone: string;
  address: string;
  detail: string;
  tag: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}

export interface PlaceSuggestion {
  id: string;
  title: string;
  address: string;
  province: string;
  city: string;
  district: string;
  lat: number;
  lng: number;
}

export interface ApiError {
  code:
    | 'BAD_REQUEST'
    | 'CONFLICT'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'PRICE_CHANGED'
    | 'UNAUTHORIZED'
    | 'CONFIG_MISSING'
    | 'INSUFFICIENT_BALANCE'
    | 'ALREADY_CHECKED_IN'
    | 'RATE_LIMITED'
    | 'WEB_PHONE_UNVERIFIED'
    | 'PHONE_ALREADY_BOUND'
    | 'ACCOUNT_DISABLED'
    | 'DELETE_CONFIRMATION_REQUIRED'
    | 'ENDPOINT_DISABLED'
    | 'CHECKOUT_EXPIRED'
    | 'QUOTE_EXPIRED'
    | 'QUOTE_MISMATCH'
    | 'QUOTE_CHANGED'
    | 'STORE_ORDER_EXISTS'
    | 'MINIMUM_ORDER_NOT_MET'
    | 'IDEMPOTENCY_CONFLICT'
    | 'INVALID_CHECKOUT'
    | 'INVALID_IDEMPOTENCY_KEY'
    | 'INVALID_CURSOR'
    | 'INVALID_QUANTITY'
    | 'ORDER_TOO_LARGE'
    | 'INVALID_ORDER_TOTAL'
    | 'INVALID_INPUT'
    | 'INVALID_VISITOR_SESSION'
    | 'PAYLOAD_TOO_LARGE'
    | 'UPSTREAM_UNAVAILABLE'
    | 'LOGIN_REQUIRED'
    /** @deprecated One-release client compatibility; new APIs return LOGIN_REQUIRED. */
    | 'GUEST_CHECKOUT_LIMIT'
    | 'INVALID_REFRESH_TOKEN'
    | 'ACCOUNT_DELETED'
    | 'INTERNAL_ERROR';
  message: string;
  requestId?: string;
}
