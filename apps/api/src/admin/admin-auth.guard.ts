import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import type { AuthenticatedAdmin } from './admin.types';

export interface AdminRequest {
  headers: { authorization?: string };
  ip?: string;
  admin?: AuthenticatedAdmin;
  adminToken?: string;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(@Inject(AdminAuthService) private readonly auth: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const match = request.headers.authorization?.match(/^Bearer (.+)$/);
    if (!match) {
      throw new UnauthorizedException({
        code: 'ADMIN_UNAUTHORIZED',
        message: '请先登录后台',
      });
    }
    request.adminToken = match[1];
    request.admin = await this.auth.resolveToken(match[1]);
    return true;
  }
}
