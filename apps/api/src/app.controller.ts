import { Body, Controller, Get, Headers, Inject, Param, Post, Query, UnauthorizedException } from '@nestjs/common';
import type {
  Address,
  QuoteRequest,
  WechatMiniLoginRequest,
  WechatPhoneRequest,
  ShareCreateRequest,
} from '@baichile/api-contract';
import { AuthService } from './auth.service';
import { CatalogService } from './catalog.service';
import { OrderService } from './order.service';
import { MapService } from './map.service';
import { AddressService } from './address.service';
import { DataSource } from 'typeorm';
import { AnalyticsService } from './analytics.service';
import { WalletService } from './wallet.service';
import { ShareService } from './share/share.service';

@Controller('v1')
export class AppController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(MapService) private readonly map: MapService,
    @Inject(AddressService) private readonly addresses: AddressService,
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(AnalyticsService) private readonly analyticsService: AnalyticsService,
    @Inject(WalletService) private readonly wallet: WalletService,
    @Inject(ShareService) private readonly shares: ShareService,
  ) {}

  @Get('health')
  health() { return { status: 'ok', service: 'baichile-api' }; }

  @Post('auth/guest')
  guest() { return this.auth.createGuest(); }

  @Post('auth/wechat-mini')
  async wechat(@Body() body: WechatMiniLoginRequest) {
    const session = await this.auth.loginWechatMini(body);
    if (body.visitorId) {
      await this.mergeIdentity(body.visitorId, session.accountId);
    }
    return session;
  }

  @Post('auth/wechat-phone')
  wechatPhone(@Body() body: WechatPhoneRequest) {
    return this.auth.getWechatPhoneNumber(body?.code);
  }

  @Post('auth/merge-visitor')
  async merge(@Body() body: { visitorId: string; accountId: string }) {
    return this.mergeIdentity(body.visitorId, body.accountId);
  }

  @Get('catalog/home')
  home() { return this.catalog.home(); }

  @Get('catalog/categories')
  async categories() { return (await this.catalog.home()).categories; }

  @Get('catalog/stores')
  stores(@Query('categoryId') categoryId?: string) { return this.catalog.list(categoryId); }

  @Get('catalog/stores/:storeId')
  store(@Param('storeId') storeId: string) { return this.catalog.find(storeId); }

  @Get('catalog/search')
  search(@Query('q') query = '') { return this.catalog.list(undefined, query); }

  @Get('map/reverse-geocode')
  reverseGeocode(@Query('lat') lat: string, @Query('lng') lng: string) {
    return this.map.reverseGeocode(Number(lat), Number(lng));
  }

  @Get('map/nearby')
  nearbyPlaces(@Query('lat') lat: string, @Query('lng') lng: string) {
    return this.map.nearbyPlaces(Number(lat), Number(lng));
  }

  @Get('map/suggest')
  suggestPlaces(@Query('keyword') keyword: string, @Query('region') region?: string) {
    return this.map.suggestPlaces(keyword || '', region);
  }

  @Get('addresses/me')
  async myAddresses(@Headers('authorization') authorization?: string) {
    return this.addresses.list(await this.auth.resolvePersistedIdentity(authorization));
  }

  @Post('addresses')
  async saveAddress(
    @Body() body: Omit<Address, 'id'> & { id?: string },
    @Headers('authorization') authorization?: string,
  ) {
    return this.addresses.save(body, await this.auth.resolvePersistedIdentity(authorization));
  }

  @Post('addresses/:addressId/delete')
  async removeAddress(
    @Param('addressId') addressId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.addresses.remove(addressId, await this.auth.resolvePersistedIdentity(authorization));
  }

  @Post('orders/quote')
  quote(@Body() body: QuoteRequest) { return this.orders.quote(body); }

  @Post('orders/virtual')
  async createOrder(
    @Body() body: QuoteRequest,
    @Headers('authorization') authorization?: string,
  ) {
    const identity = await this.auth.resolvePersistedIdentity(authorization);
    return this.orders.create(body, this.requireAccount(identity.accountId));
  }

  @Get('orders/me')
  async myOrders(@Headers('authorization') authorization?: string) {
    const identity = await this.auth.resolvePersistedIdentity(authorization);
    return this.orders.list(identity.visitorId, identity.accountId);
  }

  @Get('accounts/me/savings')
  async mySavings(@Headers('authorization') authorization?: string) {
    const identity = await this.auth.resolvePersistedIdentity(authorization);
    return this.orders.savings(identity.accountId);
  }

  @Get('accounts/me/wallet')
  async myWallet(@Headers('authorization') authorization?: string) {
    const identity = await this.auth.resolvePersistedIdentity(authorization);
    const accountId = this.requireAccount(identity.accountId);
    await this.orders.settleFailedOrders(accountId);
    return this.wallet.summary(accountId);
  }

  @Get('accounts/me/wallet/transactions')
  async myWalletTransactions(@Headers('authorization') authorization?: string) {
    const identity = await this.auth.resolvePersistedIdentity(authorization);
    const accountId = this.requireAccount(identity.accountId);
    await this.orders.settleFailedOrders(accountId);
    return this.wallet.listTransactions(accountId);
  }

  @Post('accounts/me/check-in')
  async checkIn(@Headers('authorization') authorization?: string) {
    const identity = await this.auth.resolvePersistedIdentity(authorization);
    return this.wallet.checkIn(this.requireAccount(identity.accountId));
  }

  @Post('accounts/me/test-credit')
  async testCredit(@Headers('authorization') authorization?: string) {
    const identity = await this.auth.resolvePersistedIdentity(authorization);
    return this.wallet.testCredit(this.requireAccount(identity.accountId));
  }

  @Post('shares')
  async createShare(
    @Body() body: ShareCreateRequest,
    @Headers('authorization') authorization?: string,
  ) {
    const identity = await this.auth.resolvePersistedIdentity(authorization);
    return this.shares.create(this.requireAccount(identity.accountId), body);
  }

  @Get('shares/:token')
  shareLanding(@Param('token') token: string) {
    return this.shares.landing(token);
  }

  @Post('shares/:token/initiated-reward')
  async rewardInitiatedShare(
    @Param('token') token: string,
    @Headers('authorization') authorization?: string,
  ) {
    const identity = await this.auth.resolvePersistedIdentity(authorization);
    return this.shares.rewardInitiatedShare(this.requireAccount(identity.accountId), token);
  }

  @Get('orders/:orderId')
  order(@Param('orderId') orderId: string) { return this.orders.find(orderId); }

  @Post('analytics/events')
  async analytics(@Body() body: unknown, @Headers('authorization') authorization?: string) {
    return this.analyticsService.record(body, await this.auth.resolvePersistedIdentity(authorization));
  }

  private async mergeIdentity(visitorId: string, accountId: string) {
    return this.dataSource.transaction(async (manager) => {
      await this.auth.linkVisitorToAccount(visitorId, accountId, manager);
      const orders = await this.orders.merge(visitorId, accountId, manager);
      const addresses = await this.addresses.merge(visitorId, accountId, manager);
      return { merged: orders.merged + addresses.merged };
    });
  }

  private requireAccount(accountId?: string): string {
    if (!accountId) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '请先登录' });
    }
    return accountId;
  }
}
