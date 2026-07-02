import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { Repository } from 'typeorm';
import { AdminAuditLogEntity } from '../database/entities/admin-audit-log.entity';
import type { AuthenticatedAdmin } from './admin.types';

const SECRET_KEY = /password|token|secret|openid/i;

export function sanitizeAuditData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditData);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? '[REDACTED]' : sanitizeAuditData(item),
    ]),
  );
}

export interface AuditEvent {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  ipAddress?: string | null;
}

@Injectable()
export class AdminAuditService {
  constructor(
    @InjectRepository(AdminAuditLogEntity)
    private readonly logs: Repository<AdminAuditLogEntity>,
  ) {}

  async record(
    actor: AuthenticatedAdmin,
    event: AuditEvent,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager?.getRepository(AdminAuditLogEntity) ?? this.logs;
    await repository.save(repository.create({
      adminUserId: actor.id,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId ?? null,
      beforeData: sanitizeAuditData(event.beforeData ?? null),
      afterData: sanitizeAuditData(event.afterData ?? null),
      ipAddress: event.ipAddress ?? null,
    }));
  }
}
