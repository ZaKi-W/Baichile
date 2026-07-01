import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import type { QuoteRequest, WechatMiniLoginRequest } from '@baichile/api-contract';
import { AuthService } from './auth.service';
import { CatalogService } from './catalog.service';
import { OrderService } from './order.service';
import { MapService } from './map.service';

@Controller('v1')
export class AppController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(MapService) private readonly map: MapService,
  ) {}

  @Get('health')
  health() { return { status: 'ok', service: 'baichile-api' }; }

  @Post('auth/guest')
  guest() { return this.auth.createGuest(); }

  @Post('auth/wechat-mini')
  async wechat(@Body() body: WechatMiniLoginRequest) {
    const session = await this.auth.loginWechatMini(body);
    if (body.visitorId) this.orders.merge(body.visitorId, session.accountId);
    return session;
  }

  @Post('auth/merge-visitor')
  merge(@Body() body: { visitorId: string; accountId: string }) {
    return this.orders.merge(body.visitorId, body.accountId);
  }

  @Get('catalog/home')
  home() { return this.catalog.home(); }

  @Get('catalog/categories')
  categories() { return this.catalog.home().categories; }

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

  @Post('orders/quote')
  quote(@Body() body: QuoteRequest) { return this.orders.quote(body); }

  @Post('orders/virtual')
  createOrder(@Body() body: QuoteRequest, @Headers('x-visitor-id') visitorId?: string) {
    return this.orders.create(body, visitorId);
  }

  @Get('orders/me')
  myOrders(@Headers('x-visitor-id') visitorId?: string, @Headers('x-account-id') accountId?: string) {
    return this.orders.list(visitorId, accountId);
  }

  @Get('orders/:orderId')
  order(@Param('orderId') orderId: string) { return this.orders.find(orderId); }

  @Post('analytics/events')
  analytics(@Body() body: unknown) { return { accepted: true, receivedAt: new Date().toISOString(), body }; }
}
