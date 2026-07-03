import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AccountEntity } from './entities/account.entity';
import { AddressEntity } from './entities/address.entity';
import { VirtualOrderEntity } from './entities/virtual-order.entity';
import { VisitorSessionEntity } from './entities/visitor-session.entity';
import { CreatePersistenceTables1760000000000 } from './migrations/1760000000000-CreatePersistenceTables';
import { CategoryEntity } from './entities/category.entity';
import { StoreEntity } from './entities/store.entity';
import { StoreSubCategoryEntity } from './entities/store-sub-category.entity';
import { MenuItemEntity } from './entities/menu-item.entity';
import { AnalyticsEventEntity } from './entities/analytics-event.entity';
import { CreateCatalogAndAnalyticsTables1760000001000 } from './migrations/1760000001000-CreateCatalogAndAnalyticsTables';
import { AddCalories1760000002000 } from './migrations/1760000002000-AddCalories';
import { WalletTransactionEntity } from './entities/wallet-transaction.entity';
import { AddWallet1760000003000 } from './migrations/1760000003000-AddWallet';
import { AddDeliveryIncidents1760000004000 } from './migrations/1760000004000-AddDeliveryIncidents';
import { AdminUserEntity } from './entities/admin-user.entity';
import { AdminSessionEntity } from './entities/admin-session.entity';
import { AdminAuditLogEntity } from './entities/admin-audit-log.entity';
import { AddAdminConsole1760000005000 } from './migrations/1760000005000-AddAdminConsole';
import { ShareConfigEntity } from './entities/share-config.entity';
import { ShareInviteEntity } from './entities/share-invite.entity';
import { AddShareRewards1760000006000 } from './migrations/1760000006000-AddShareRewards';

export function createDatabaseOptions(): PostgresConnectionOptions {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('缺少 DATABASE_URL，无法连接 PostgreSQL');
  }

  return {
    type: 'postgres',
    url,
    synchronize: false,
    entities: [
      AccountEntity, VisitorSessionEntity, AddressEntity, VirtualOrderEntity,
      CategoryEntity, StoreEntity, StoreSubCategoryEntity, MenuItemEntity, AnalyticsEventEntity,
      WalletTransactionEntity,
      AdminUserEntity, AdminSessionEntity, AdminAuditLogEntity,
      ShareConfigEntity, ShareInviteEntity,
    ],
    migrations: [
      CreatePersistenceTables1760000000000,
      CreateCatalogAndAnalyticsTables1760000001000,
      AddCalories1760000002000,
      AddWallet1760000003000,
      AddDeliveryIncidents1760000004000,
      AddAdminConsole1760000005000,
      AddShareRewards1760000006000,
    ],
  };
}
