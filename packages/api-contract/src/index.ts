import type { SpecGroup } from '@baichile/domain';
import type { DeliveryStatus, VirtualRoute } from '@baichile/map-core';

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
  monthlySales: number;
  specGroups: SpecGroup[];
  sourceType: SourceType;
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

export interface HomeResponse {
  categories: Category[];
  featured: StoreSummary[];
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
}

export interface QuoteLine {
  menuItemId: string;
  name: string;
  optionNames: string[];
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface OrderQuote {
  storeId: string;
  lines: QuoteLine[];
  itemsTotalCents: number;
  deliveryFeeCents: number;
  packingFeeCents: number;
  totalCents: number;
}

export interface VirtualOrder extends OrderQuote {
  id: string;
  isVirtual: true;
  visitorId?: string;
  accountId?: string;
  virtualDestinationId: string;
  status: DeliveryStatus;
  startedAt: string;
  durationMs: number;
  seed: string;
  route: VirtualRoute;
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
}

export interface AccountSession {
  accountId: string;
  accessToken: string;
  provider: 'wechat' | 'dev-mock';
  profile: UserProfile;
}

export interface AdministrativeArea {
  province: string;
  city: string;
  district: string;
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
  code: 'BAD_REQUEST' | 'NOT_FOUND' | 'PRICE_CHANGED' | 'UNAUTHORIZED' | 'CONFIG_MISSING';
  message: string;
}
