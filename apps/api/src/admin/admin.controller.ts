import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuthGuard, type AdminRequest } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminMutationService } from './admin-mutation.service';
import { AdminPermissionGuard } from './admin-permission.guard';
import { RequireAdminPermission } from './admin-permission.decorator';
import { AdminQueryService, type AdminListQuery } from './admin-query.service';
import { ShareService } from '../share/share.service';

@Controller('v1/admin/auth')
export class AdminAuthController {
  constructor(
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
  ) {}

  @Post('login')
  async login(
    @Body() body: { username?: string; password?: string },
    @Req() request: AdminRequest,
  ) {
    const result = await this.auth.login(body.username ?? '', body.password ?? '');
    await this.audit.record(result.admin, {
      action: 'auth.login',
      resourceType: 'admin_user',
      resourceId: result.admin.id,
      ipAddress: request.ip,
    });
    return result;
  }
}

@Controller('v1/admin')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminController {
  constructor(
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
    @Inject(AdminQueryService) private readonly query: AdminQueryService,
    @Inject(AdminMutationService) private readonly mutation: AdminMutationService,
    @Inject(ShareService) private readonly shares: ShareService,
  ) {}

  @Get('auth/me')
  me(@Req() request: AdminRequest) {
    return request.admin;
  }

  @Post('auth/logout')
  async logout(@Req() request: AdminRequest) {
    await this.audit.record(request.admin!, {
      action: 'auth.logout',
      resourceType: 'admin_user',
      resourceId: request.admin!.id,
      ipAddress: request.ip,
    });
    return this.auth.logout(request.adminToken!);
  }

  @Post('auth/change-password')
  changePassword(
    @Body() body: { currentPassword?: string; newPassword?: string },
    @Req() request: AdminRequest,
  ) {
    return this.auth.changePassword(
      request.admin!,
      body.currentPassword ?? '',
      body.newPassword ?? '',
      request.adminToken!,
    );
  }

  @Get('dashboard')
  @RequireAdminPermission('dashboard:read')
  dashboard() {
    return this.query.dashboard();
  }

  @Get('stores')
  @RequireAdminPermission('catalog:read')
  stores(@Query() query: AdminListQuery) {
    return this.query.listStores(query);
  }

  @Get('stores/:id')
  @RequireAdminPermission('catalog:read')
  store(@Param('id') id: string) {
    return this.query.store(id);
  }

  @Post('stores')
  @RequireAdminPermission('catalog:write')
  createStore(@Body() body: unknown, @Req() request: AdminRequest) {
    return this.mutation.createStore(body, request.admin!, request.ip);
  }

  @Patch('stores/:id')
  @RequireAdminPermission('catalog:write')
  updateStore(@Param('id') id: string, @Body() body: unknown, @Req() request: AdminRequest) {
    return this.mutation.updateStore(id, body, request.admin!, request.ip);
  }

  @Get('stores/:storeId/menu-items')
  @RequireAdminPermission('catalog:read')
  menuItems(@Param('storeId') storeId: string, @Query() query: AdminListQuery) {
    return this.query.listMenuItems(storeId, query);
  }

  @Get('stores/:storeId/menu-items/:id')
  @RequireAdminPermission('catalog:read')
  menuItem(@Param('storeId') storeId: string, @Param('id') id: string) {
    return this.query.menuItem(storeId, id);
  }

  @Post('stores/:storeId/menu-items')
  @RequireAdminPermission('catalog:write')
  createMenuItem(@Param('storeId') storeId: string, @Body() body: unknown, @Req() request: AdminRequest) {
    return this.mutation.createMenuItem(storeId, body, request.admin!, request.ip);
  }

  @Patch('stores/:storeId/menu-items/:id')
  @RequireAdminPermission('catalog:write')
  updateMenuItem(
    @Param('storeId') storeId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
  ) {
    return this.mutation.updateMenuItem(storeId, id, body, request.admin!, request.ip);
  }

  @Post('stores/:storeId/menu-items/:id/transfer')
  @RequireAdminPermission('catalog:write')
  transferMenuItem(
    @Param('storeId') storeId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
  ) {
    return this.mutation.transferMenuItem(storeId, id, body, request.admin!, request.ip);
  }

  @Get('accounts')
  @RequireAdminPermission('accounts:read')
  accounts(@Query() query: AdminListQuery) {
    return this.query.listAccounts(query);
  }

  @Get('accounts/:id')
  @RequireAdminPermission('accounts:read')
  account(@Param('id') id: string) {
    return this.query.account(id);
  }

  @Patch('accounts/:id')
  @RequireAdminPermission('accounts:write')
  updateAccount(@Param('id') id: string, @Body() body: unknown, @Req() request: AdminRequest) {
    return this.mutation.updateAccount(id, body, request.admin!, request.ip);
  }

  @Get('accounts/:id/wallet')
  @RequireAdminPermission('wallet:read')
  wallet(@Param('id') id: string, @Query() query: AdminListQuery) {
    return this.query.wallet(id, query);
  }

  @Post('accounts/:id/wallet/adjustments')
  @RequireAdminPermission('wallet:adjust')
  adjustWallet(@Param('id') id: string, @Body() body: unknown, @Req() request: AdminRequest) {
    return this.mutation.adjustWallet(id, body, request.admin!, request.ip);
  }

  @Get('orders')
  @RequireAdminPermission('orders:read')
  orders(@Query() query: AdminListQuery) {
    return this.query.listOrders(query);
  }

  @Get('orders/:id')
  @RequireAdminPermission('orders:read')
  order(@Param('id') id: string) {
    return this.query.order(id);
  }

  @Patch('orders/:id')
  @RequireAdminPermission('orders:write')
  updateOrder(@Param('id') id: string, @Body() body: unknown, @Req() request: AdminRequest) {
    return this.mutation.updateOrder(id, body, request.admin!, request.ip);
  }

  @Get('admin-users')
  @RequireAdminPermission('admins:manage')
  adminUsers(@Query() query: AdminListQuery) {
    return this.query.listAdminUsers(query);
  }

  @Post('admin-users')
  @RequireAdminPermission('admins:manage')
  createAdmin(@Body() body: unknown, @Req() request: AdminRequest) {
    return this.mutation.createAdmin(body, request.admin!, request.ip);
  }

  @Patch('admin-users/:id')
  @RequireAdminPermission('admins:manage')
  updateAdmin(@Param('id') id: string, @Body() body: unknown, @Req() request: AdminRequest) {
    return this.mutation.updateAdmin(id, body, request.admin!, request.ip);
  }

  @Post('admin-users/:id/reset-password')
  @RequireAdminPermission('admins:manage')
  resetAdminPassword(@Param('id') id: string, @Body() body: unknown, @Req() request: AdminRequest) {
    return this.mutation.resetAdminPassword(id, body, request.admin!, request.ip);
  }

  @Get('audit-logs')
  @RequireAdminPermission('audit:read')
  auditLogs(@Query() query: AdminListQuery) {
    return this.query.listAuditLogs(query);
  }

  @Get('share-rewards/config')
  @RequireAdminPermission('wallet:read')
  shareRewardConfig() {
    return this.shares.config();
  }

  @Patch('share-rewards/config')
  @RequireAdminPermission('wallet:adjust')
  async updateShareRewardConfig(@Body() body: unknown, @Req() request: AdminRequest) {
    const before = await this.shares.config();
    const after = await this.shares.updateConfig(body);
    await this.audit.record(request.admin!, {
      action: 'share_reward_config.update',
      resourceType: 'share_reward_config',
      resourceId: 'default',
      beforeData: before,
      afterData: after,
      ipAddress: request.ip,
    });
    return after;
  }
}
