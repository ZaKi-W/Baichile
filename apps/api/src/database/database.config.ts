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
    ],
    migrations: [CreatePersistenceTables1760000000000, CreateCatalogAndAnalyticsTables1760000001000],
  };
}
