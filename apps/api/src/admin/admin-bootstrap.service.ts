import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';

@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(private readonly auth: AdminAuthService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (await this.auth.countUsers()) return;
    const username = process.env.ADMIN_BOOTSTRAP_USERNAME?.trim();
    const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
    if (!username || !password) {
      this.logger.warn('尚无后台管理员；请设置 ADMIN_BOOTSTRAP_USERNAME 和 ADMIN_BOOTSTRAP_PASSWORD');
      return;
    }
    await this.auth.createAdmin({
      username,
      displayName: process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME?.trim() || '超级管理员',
      password,
      role: 'super_admin',
    });
    this.logger.log(`已创建初始后台管理员：${username}`);
  }
}
