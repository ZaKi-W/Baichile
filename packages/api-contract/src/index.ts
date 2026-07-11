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
}

export interface FlashSaleItem {
  menuItemId: string;
  storeId: string;
  subCategoryId?: string;
  storeName: string;
  name: string;
  imageUrl?: string;
  originalPriceCents: number;
  flashPriceCents: number;
}

export interface HomeResponse {
  categories: Category[];
  featured: StoreSummary[];
  flashSaleItems: FlashSaleItem[];
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

export interface AccountSavings {
  savedMoneyCents: number;
  savedCaloriesKcal: number;
  completedOrderCount: number;
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

export type ShareKind = 'order' | 'achievement' | 'invitation';

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
}

export interface ShareLanding {
  active: boolean;
  kind?: ShareKind;
  title?: string;
  dishNames: string[];
  savedMoneyCents: number;
  savedCaloriesKcal: number;
  completedOrderCount: number;
  inviteeRewardCents: number;
  benefitText: string;
}

export interface WalletSummary {
  balanceCents: number;
  checkedInToday: boolean;
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
  visitorId?: string;
  accountId?: string;
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
}

export interface GuestSession {
  visitorId: string;
  accessToken: string;
  refreshToken: string;
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
  provider: 'wechat' | 'dev-mock';
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
    | 'NOT_FOUND'
    | 'PRICE_CHANGED'
    | 'UNAUTHORIZED'
    | 'CONFIG_MISSING'
    | 'INSUFFICIENT_BALANCE'
    | 'ALREADY_CHECKED_IN';
  message: string;
}
