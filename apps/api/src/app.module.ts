import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AuthService } from './auth.service';
import { CatalogService } from './catalog.service';
import { OrderService } from './order.service';
import { MapService } from './map.service';
import { AddressService } from './address.service';
import { createDatabaseOptions } from './database/database.config';
import { AccountEntity } from './database/entities/account.entity';
import { AddressEntity } from './database/entities/address.entity';
import { VirtualOrderEntity } from './database/entities/virtual-order.entity';
import { VisitorSessionEntity } from './database/entities/visitor-session.entity';
import { CategoryEntity } from './database/entities/category.entity';
import { StoreEntity } from './database/entities/store.entity';
import { StoreSubCategoryEntity } from './database/entities/store-sub-category.entity';
import { MenuItemEntity } from './database/entities/menu-item.entity';
import { AnalyticsEventEntity } from './database/entities/analytics-event.entity';
import { AnalyticsService } from './analytics.service';
import { WalletTransactionEntity } from './database/entities/wallet-transaction.entity';
import { WalletService } from './wallet.service';
import { AdminUserEntity } from './database/entities/admin-user.entity';
import { AdminSessionEntity } from './database/entities/admin-session.entity';
import { AdminAuditLogEntity } from './database/entities/admin-audit-log.entity';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(createDatabaseOptions()),
    TypeOrmModule.forFeature([
      AccountEntity, VisitorSessionEntity, AddressEntity, VirtualOrderEntity,
      CategoryEntity, StoreEntity, StoreSubCategoryEntity, MenuItemEntity, AnalyticsEventEntity,
      WalletTransactionEntity,
      AdminUserEntity, AdminSessionEntity, AdminAuditLogEntity,
    ]),
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AuthService, CatalogService, OrderService, MapService, AddressService, AnalyticsService, WalletService],
})
export class AppModule {}
