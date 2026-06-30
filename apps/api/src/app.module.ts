import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthService } from './auth.service';
import { CatalogService } from './catalog.service';
import { OrderService } from './order.service';
import { MapService } from './map.service';

@Module({
  controllers: [AppController],
  providers: [AuthService, CatalogService, OrderService, MapService],
})
export class AppModule {}
