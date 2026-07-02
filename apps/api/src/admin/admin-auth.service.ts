import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import type { AdminRole } from '@baichile/api-contract';
import { AdminSessionEntity } from '../database/entities/admin-session.entity';
import { AdminUserEntity } from '../database/entities/admin-user.entity';
import {
  hashAdminPassword,
  hashAdminToken,
  ROLE_PERMISSIONS,
  type AuthenticatedAdmin,
  verifyAdminPassword,
} from './admin.types';

const SESSION_MS = 8 * 60 * 60 * 1000;

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(AdminUserEntity) private readonly users: Repository<AdminUserEntity>,
    @InjectRepository(AdminSessionEntity) private readonly sessions: Repository<AdminSessionEntity>,
  ) {}

  async login(username: string, password: string): Promise<{
    accessToken: string;
    expiresAt: string;
    admin: AuthenticatedAdmin;
  }> {
    const normalized = username.trim().toLowerCase();
    const user = await this.users.findOne({ where: { username: normalized } });
    const valid = user ? await verifyAdminPassword(password, user.passwordHash) : false;
    if (!user || !valid || user.status !== 'active') {
      throw new UnauthorizedException({
        code: 'ADMIN_LOGIN_FAILED',
        message: '账号或密码错误',
      });
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_MS);
    await this.sessions.save(this.sessions.create({
      adminUserId: user.id,
      tokenHash: hashAdminToken(token),
      expiresAt,
      revokedAt: null,
    }));
    user.lastLoginAt = new Date();
    await this.users.save(user);
    return { accessToken: token, expiresAt: expiresAt.toISOString(), admin: this.toAdmin(user) };
  }

  async resolveToken(token: string): Promise<AuthenticatedAdmin> {
    const session = await this.sessions.findOne({
      where: {
        tokenHash: hashAdminToken(token),
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
    if (!session) throw this.unauthorized();
    const user = await this.users.findOne({ where: { id: session.adminUserId } });
    if (!user || user.status !== 'active') throw this.unauthorized();
    return this.toAdmin(user);
  }

  async logout(token: string): Promise<{ success: true }> {
    await this.sessions.update(
      { tokenHash: hashAdminToken(token), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return { success: true };
  }

  async changePassword(
    actor: AuthenticatedAdmin,
    currentPassword: string,
    nextPassword: string,
    currentToken: string,
  ): Promise<{ success: true }> {
    if (nextPassword.length < 10) {
      throw new ConflictException({ code: 'WEAK_PASSWORD', message: '密码至少 10 位' });
    }
    const user = await this.users.findOneByOrFail({ id: actor.id });
    if (!(await verifyAdminPassword(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException({ code: 'PASSWORD_INCORRECT', message: '当前密码错误' });
    }
    user.passwordHash = await hashAdminPassword(nextPassword);
    await this.users.save(user);
    await this.sessions.createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('admin_user_id = :id', { id: actor.id })
      .andWhere('token_hash <> :tokenHash', { tokenHash: hashAdminToken(currentToken) })
      .andWhere('revoked_at IS NULL')
      .execute();
    return { success: true };
  }

  async countUsers(): Promise<number> {
    return this.users.count();
  }

  async createAdmin(input: {
    username: string;
    displayName: string;
    password: string;
    role: AdminRole;
  }): Promise<AdminUserEntity> {
    if (input.password.length < 10) {
      throw new ConflictException({ code: 'WEAK_PASSWORD', message: '密码至少 10 位' });
    }
    const username = input.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      throw new ConflictException({ code: 'INVALID_USERNAME', message: '用户名格式不正确' });
    }
    if (await this.users.exists({ where: { username } })) {
      throw new ConflictException({ code: 'USERNAME_EXISTS', message: '用户名已存在' });
    }
    return this.users.save(this.users.create({
      username,
      displayName: input.displayName.trim() || username,
      passwordHash: await hashAdminPassword(input.password),
      role: input.role,
      status: 'active',
      lastLoginAt: null,
    }));
  }

  private toAdmin(user: AdminUserEntity): AuthenticatedAdmin {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      permissions: ROLE_PERMISSIONS[user.role],
    };
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'ADMIN_UNAUTHORIZED',
      message: '后台登录已失效',
    });
  }
}
