import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsEventEntity } from './database/entities/analytics-event.entity';

type Identity = { visitorId?: string; accountId?: string };

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(AnalyticsEventEntity) private readonly events: Repository<AnalyticsEventEntity>,
  ) {}

  async record(body: unknown, identity: Identity) {
    const input = body as { eventName?: unknown; payload?: unknown };
    const eventName = typeof input?.eventName === 'string' ? input.eventName.trim() : '';
    if (!eventName) throw new BadRequestException('eventName 不能为空');
    const payload = input.payload && typeof input.payload === 'object'
      ? input.payload as Record<string, unknown>
      : {};
    const event = await this.events.save(this.events.create({
      visitorId: identity.visitorId ?? null,
      accountId: identity.accountId ?? null,
      eventName,
      payload,
    }));
    return { accepted: true, receivedAt: event.createdAt.toISOString() };
  }
}
