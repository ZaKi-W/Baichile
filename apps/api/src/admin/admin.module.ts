import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../database/entities/account.entity';
import { AdminAuditLogEntity } from '../database/entities/admin-audit-log.entity';
import { AdminSessionEntity } from '../database/entities/admin-session.entity';
import { AdminUserEntity } from '../database/entities/admin-user.entity';
import { MenuItemEntity } from '../database/entities/menu-item.entity';
import { StoreEntity } from '../database/entities/store.entity';
import { VirtualOrderEntity } from '../database/entities/virtual-order.entity';
import { WalletTransactionEntity } from '../database/entities/wallet-transaction.entity';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AdminAuthController, AdminController } from './admin.controller';
import { AdminMutationService } from './admin-mutation.service';
import { AdminPermissionGuard } from './admin-permission.guard';
import { AdminQueryService } from './admin-query.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountEntity,
      AdminAuditLogEntity,
      AdminSessionEntity,
      AdminUserEntity,
      MenuItemEntity,
      StoreEntity,
      VirtualOrderEntity,
      WalletTransactionEntity,
    ]),
  ],
  controllers: [AdminAuthController, AdminController],
  providers: [
    AdminAuditService,
    AdminAuthGuard,
    AdminAuthService,
    AdminBootstrapService,
    AdminMutationService,
    AdminPermissionGuard,
    AdminQueryService,
  ],
})
export class AdminModule {}
