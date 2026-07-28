import { describe, expect, it, vi } from 'vitest';
import {
  AdminAuditService,
  AdminAuthService,
  AdminMutationService,
  AdminQueryService,
} from './admin-services';
import { collections } from './collections';
import { MemoryDatabase } from './database';
import { toErrorBody } from './errors';
import type { AccountDoc, AdminAuditLogDoc, AnalyticsEventDoc, VirtualOrderDoc } from './models';
import { sanitizeForAuditLog, sanitizeLogMessage } from './redaction';
import { BaichileCloudServices } from './services';

const actor = {
  id: 'admin_1',
  username: 'admin',
  displayName: '管理员',
  role: 'super_admin' as const,
  permissions: [],
};

describe('privacy boundaries', () => {
  it('recursively redacts secret keys and sensitive values in audit data', () => {
    expect(sanitizeForAuditLog({
      profile: {
        phoneNumber: '13800138000',
        nested: [{ passwordHash: 'a'.repeat(64), note: 'call 13900139000' }],
      },
      authorization: 'Bearer secret-token',
    })).toEqual({
      profile: {
        phoneNumber: '[REDACTED]',
        nested: [{ passwordHash: '[REDACTED]', note: 'call [REDACTED]' }],
      },
      authorization: '[REDACTED]',
    });
    expect(sanitizeLogMessage(`token=abc ${'a'.repeat(64)} 13800138000`))
      .toBe('token=[REDACTED] [REDACTED] [REDACTED]');
  });

  it('stores redacted audit snapshots and masks account query output', async () => {
    const db = new MemoryDatabase();
    await new AdminAuditService(db).record(actor, {
      action: 'account.update',
      resourceType: 'account',
      beforeData: { phone: '13800138000', credentials: { token: 'secret' } },
    });
    const audit = (await db.collection<AdminAuditLogDoc>(collections.adminAuditLogs).list())[0];
    expect(audit.beforeData).toEqual({
      phone: '[REDACTED]',
      credentials: { token: '[REDACTED]' },
    });
    const now = new Date().toISOString();
    await db.collection<AccountDoc>(collections.accounts).insert({
      _id: 'account_private',
      id: 'account_private',
      wechatOpenIdHash: 'a'.repeat(64),
      webAuthUidHash: null,
      phoneHash: 'b'.repeat(64),
      phoneNumber: '13800138000',
      mergedIntoAccountId: null,
      nickname: '王小白',
      avatarUrl: null,
      balanceCents: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    const result = await new AdminQueryService(db).listAccounts({ page: '1', pageSize: '20' });

    expect(result.items[0]).toMatchObject({
      phoneNumber: '138****8000',
      nickname: '王**',
    });
    expect(result.items[0]).not.toHaveProperty('wechatOpenIdHash');
    expect(result.items[0]).not.toHaveProperty('phoneHash');
  });

  it('returns a request id and never exposes unknown internal error messages', () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(toErrorBody(new Error('database token=top-secret'), 'request-123')).toEqual({
        ok: false,
        status: 500,
        code: 'INTERNAL_ERROR',
        message: '服务暂不可用',
        requestId: 'request-123',
      });
    } finally {
      logger.mockRestore();
    }
  });

  it('masks the order returned by an admin mutation while preserving the stored snapshot', async () => {
    const db = new MemoryDatabase();
    await db.collection<VirtualOrderDoc>(collections.virtualOrders).insert({
      _id: 'order_private',
      id: 'order_private',
      deliveryAddress: {
        name: '王小白',
        phone: '13800138000',
        address: '上海市测试路 1 号',
        detail: '101',
      },
      destinationId: 'addr_private_destination',
      route: {
        id: 'route_private',
        cityCode: '310000',
        origin: { lat: 31.21, lng: 121.41, coordSystem: 'gcj02' },
        destination: { lat: 31.22, lng: 121.42, coordSystem: 'gcj02' },
        polyline: [
          { lat: 31.21, lng: 121.41, coordSystem: 'gcj02' },
          { lat: 31.22, lng: 121.42, coordSystem: 'gcj02' },
        ],
        routeSource: 'prebuilt',
        label: '虚拟配送路线',
      },
      adminStatus: 'normal',
      adminNote: '',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as VirtualOrderDoc);
    const mutations = new AdminMutationService(
      db,
      new AdminAuthService(db),
      new AdminAuditService(db),
    );

    const result = await mutations.updateOrder(
      'order_private',
      { adminStatus: 'following_up' },
      actor,
    );

    expect(result.deliveryAddress).toEqual({
      name: '王**',
      phone: '138****8000',
      address: '上海市测试路***',
      detail: '101***',
    });
    expect(result.destinationId).toBe('[REDACTED]');
    expect(result.route).toEqual({
      id: 'route_private',
      cityCode: '310000',
      routeSource: 'prebuilt',
      label: '虚拟配送路线',
    });
    expect((await db.collection<VirtualOrderDoc>(collections.virtualOrders).get('order_private'))
      ?.deliveryAddress).toMatchObject({ phone: '13800138000', detail: '101' });
    expect((await db.collection<VirtualOrderDoc>(collections.virtualOrders).get('order_private')))
      .toMatchObject({
        destinationId: 'addr_private_destination',
        route: {
          destination: { lat: 31.22, lng: 121.42 },
          polyline: [
            { lat: 31.21, lng: 121.41 },
            { lat: 31.22, lng: 121.42 },
          ],
        },
      });
  });

  it('redacts sensitive analytics payload values before persistence', async () => {
    const db = new MemoryDatabase();
    await new BaichileCloudServices(db).analytics.record({
      eventId: 'event_private_01',
      eventName: 'promotion.impression',
      payload: {
        phone: '13800138000',
        nested: { authorization: 'Bearer secret-token', promotionId: 'promotion_1' },
      },
    });

    expect(await db.collection<AnalyticsEventDoc>(collections.analyticsEvents).get('event_private_01'))
      .toMatchObject({
        payload: {
          phone: '[REDACTED]',
          nested: {
            authorization: '[REDACTED]',
            promotionId: 'promotion_1',
          },
        },
      });
  });
});
