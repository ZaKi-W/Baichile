import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminPermission } from '@baichile/api-contract';
import { ADMIN_PERMISSION_KEY } from './admin-permission.decorator';
import type { AdminRequest } from './admin-auth.guard';

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<AdminPermission>(
      ADMIN_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) return true;
    const admin = context.switchToHttp().getRequest<AdminRequest>().admin;
    if (!admin?.permissions.includes(permission)) {
      throw new ForbiddenException({ code: 'ADMIN_FORBIDDEN', message: '没有操作权限' });
    }
    return true;
  }
}
