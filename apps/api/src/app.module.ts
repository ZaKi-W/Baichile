import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthService } from './auth.service';
import { CatalogService } from './catalog.service';
import { OrderService } from './order.service';

@Module({
  controllers: [AppController],
  providers: [AuthService, CatalogService, OrderService],
})
export class AppModule {}

