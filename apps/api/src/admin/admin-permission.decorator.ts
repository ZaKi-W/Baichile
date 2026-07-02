import { SetMetadata } from '@nestjs/common';
import type { AdminPermission } from '@baichile/api-contract';

export const ADMIN_PERMISSION_KEY = 'admin_permission';
export const RequireAdminPermission = (permission: AdminPermission) =>
  SetMetadata(ADMIN_PERMISSION_KEY, permission);
