import { describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { AccountEntity } from '../src/database/entities/account.entity';
import { AdminAuditLogEntity } from '../src/database/entities/admin-audit-log.entity';
import { AdminSessionEntity } from '../src/database/entities/admin-session.entity';
import { AdminUserEntity } from '../src/database/entities/admin-user.entity';
import { MenuItemEntity } from '../src/database/entities/menu-item.entity';
import { StoreEntity } from '../src/database/entities/store.entity';
import { VirtualOrderEntity } from '../src/database/entities/virtual-order.entity';

describe('admin database metadata', () => {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL ?? 'postgresql://unused',
    entities: [
      AccountEntity,
      AdminAuditLogEntity,
      AdminSessionEntity,
      AdminUserEntity,
      MenuItemEntity,
      StoreEntity,
      VirtualOrderEntity,
    ],
  });

  it('registers the three admin tables', async () => {
    await dataSource.buildMetadatas();

    expect(dataSource.getMetadata(AdminUserEntity).tableName).toBe('admin_users');
    expect(dataSource.getMetadata(AdminSessionEntity).tableName).toBe('admin_sessions');
    expect(dataSource.getMetadata(AdminAuditLogEntity).tableName).toBe('admin_audit_logs');
  });

  it('adds managed status fields to business entities', async () => {
    await dataSource.buildMetadatas();

    expect(dataSource.getMetadata(StoreEntity).findColumnWithPropertyName('status')).toBeDefined();
    expect(dataSource.getMetadata(MenuItemEntity).findColumnWithPropertyName('status')).toBeDefined();
    expect(dataSource.getMetadata(AccountEntity).findColumnWithPropertyName('status')).toBeDefined();
    expect(dataSource.getMetadata(VirtualOrderEntity).findColumnWithPropertyName('adminStatus')).toBeDefined();
  });
});
