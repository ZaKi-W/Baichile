import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import type { Address, QuoteRequest, WechatMiniLoginRequest } from '@baichile/api-contract';
import { AuthService } from './auth.service';
import { CatalogService } from './catalog.service';
import { OrderService } from './order.service';
import { MapService } from './map.service';
import { AddressService } from './address.service';
import { DataSource } from 'typeorm';
import { AnalyticsService } from './analytics.service';

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
    return this.orders.create(body, identity.visitorId, identity.accountId);
  }

  @Get('orders/me')
  async myOrders(@Headers('authorization') authorization?: string) {
    const identity = await this.auth.resolvePersistedIdentity(authorization);
    return this.orders.list(identity.visitorId, identity.accountId);
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
}
