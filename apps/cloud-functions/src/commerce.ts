import { randomUUID } from 'node:crypto';
import type {
  GameplayConfig,
  PromotionCampaign,
  PromotionLifecycleStatus,
  PromotionThresholdTier,
  PromotionType,
} from '@baichile/api-contract';
import { collections } from './collections';
import type { Database } from './database';
import { badRequest, conflict, notFound } from './errors';
import type {
  GameplayConfigDoc,
  MenuItemDoc,
  PromotionCampaignDoc,
  StoreDoc,
} from './models';

export const DEFAULT_GAMEPLAY_CONFIG: GameplayConfig = {
  id: 'default',
  firstCheckoutGuaranteed: true,
  deliveryIncidentRate: 0.1,
  successEggRate: 0.1,
  updatedAt: '1970-01-01T00:00:00.000Z',
};

const localPromotionPublishLocks = new Map<string, Promise<void>>();

export class GameplayService {
  constructor(private readonly db: Database) {}

  async get(db = this.db): Promise<GameplayConfig> {
    const row = await db.collection<GameplayConfigDoc>(collections.gameplayConfigs).get('default');
    return row ?? DEFAULT_GAMEPLAY_CONFIG;
  }

  async update(value: unknown): Promise<GameplayConfig> {
    const current = await this.get();
    const input = object(value);
    const next: GameplayConfig = {
      id: 'default',
      firstCheckoutGuaranteed: 'firstCheckoutGuaranteed' in input
        ? boolean(input.firstCheckoutGuaranteed, '首次结算保送')
        : current.firstCheckoutGuaranteed,
      deliveryIncidentRate: 'deliveryIncidentRate' in input
        ? probability(input.deliveryIncidentRate, '配送事故率')
        : current.deliveryIncidentRate,
      successEggRate: 'successEggRate' in input
        ? probability(input.successEggRate, '成功订单彩蛋率')
        : current.successEggRate,
      updatedAt: this.db.now().toISOString(),
    };
    return this.db.collection<GameplayConfigDoc>(collections.gameplayConfigs).upsert('default', next);
  }
}

export class PromotionService {
  constructor(private readonly db: Database) {}

  async list(): Promise<PromotionCampaign[]> {
    return this.db.collection<PromotionCampaignDoc>(collections.promotionCampaigns).list({
      orderBy: [['createdAt', 'desc']],
    });
  }

  async get(id: string): Promise<PromotionCampaign> {
    const row = await this.db.collection<PromotionCampaignDoc>(collections.promotionCampaigns).get(id);
    if (!row) notFound('促销活动不存在', 'PROMOTION_NOT_FOUND');
    return row;
  }

  async save(id: string | undefined, value: unknown): Promise<PromotionCampaign> {
    const current = id
      ? await this.db.collection<PromotionCampaignDoc>(collections.promotionCampaigns).get(id)
      : null;
    if (id && !current) notFound('促销活动不存在', 'PROMOTION_NOT_FOUND');
    const input = parsePromotion(value, id ?? undefined);
    const targetId = id ?? input.id;
    return withLocalPromotionPublishLock(promotionStoreLockKey(input.storeId), () => (
      this.db.transaction(async (tx) => {
        const campaigns = tx.collection<PromotionCampaignDoc>(collections.promotionCampaigns);
        const latest = id ? await campaigns.get(targetId) : null;
        if (id && !latest) notFound('促销活动不存在', 'PROMOTION_NOT_FOUND');
        if (!id && await campaigns.get(targetId)) {
          conflict('促销活动 ID 已存在', 'PROMOTION_EXISTS');
        }
        const now = tx.now().toISOString();
        const lifecycleStatus = latest?.lifecycleStatus === 'published'
          ? 'published'
          : input.lifecycleStatus === 'published'
            ? 'draft'
            : input.lifecycleStatus;
        const row: PromotionCampaignDoc = {
          ...input,
          _id: targetId,
          id: targetId,
          lifecycleStatus,
          createdAt: latest?.createdAt ?? now,
          updatedAt: now,
        };
        await this.validateReferences(row, tx);
        if (lifecycleStatus === 'published') {
          await this.bumpPromotionStoreRevision(row.storeId, tx);
          await this.assertNoPublishedOverlap(row, tx);
        }
        if (latest) return campaigns.update(targetId, row);
        return campaigns.insert(row);
      })
    ));
  }

  async publish(id: string): Promise<PromotionCampaign> {
    const initial = await this.get(id) as PromotionCampaignDoc;
    return withLocalPromotionPublishLock(promotionStoreLockKey(initial.storeId), () => this.db.transaction(async (tx) => {
      const campaigns = tx.collection<PromotionCampaignDoc>(collections.promotionCampaigns);
      const row = await campaigns.get(id);
      if (!row) notFound('促销活动不存在', 'PROMOTION_NOT_FOUND');
      await this.validateReferences(row, tx);
      await this.bumpPromotionStoreRevision(row.storeId, tx);
      await this.assertNoPublishedOverlap(row, tx);
      return campaigns.update(id, {
        lifecycleStatus: 'published',
        updatedAt: tx.now().toISOString(),
      });
    }));
  }

  async pause(id: string): Promise<PromotionCampaign> {
    await this.get(id);
    return this.db.collection<PromotionCampaignDoc>(collections.promotionCampaigns).update(id, {
      lifecycleStatus: 'paused',
      updatedAt: this.db.now().toISOString(),
    });
  }

  async remove(id: string): Promise<PromotionCampaign> {
    const row = await this.get(id);
    if (row.lifecycleStatus === 'published') {
      conflict('已发布活动需先暂停后删除', 'PROMOTION_MUST_BE_PAUSED');
    }
    await this.db.collection<PromotionCampaignDoc>(collections.promotionCampaigns).remove(id);
    return row;
  }

  async activeForStore(storeId: string, at = this.db.now().toISOString(), db = this.db): Promise<PromotionCampaign[]> {
    const rows = await db.collection<PromotionCampaignDoc>(collections.promotionCampaigns).list({
      where: { storeId, lifecycleStatus: 'published' },
      orderBy: [['startsAt', 'asc']],
    });
    return rows.filter((row) => row.startsAt <= at && row.endsAt > at);
  }

  private async validateReferences(promotion: PromotionCampaign, db: Database): Promise<void> {
    const store = await db.collection<StoreDoc>(collections.stores).get(promotion.storeId);
    if (!store) notFound('促销关联商家不存在', 'STORE_NOT_FOUND');
    if (promotion.type === 'item_flash') {
      const item = promotion.menuItemId
        ? await db.collection<MenuItemDoc>(collections.menuItems).get(promotion.menuItemId)
        : null;
      if (!item || item.storeId !== promotion.storeId) {
        notFound('促销关联菜品不存在', 'MENU_ITEM_NOT_FOUND');
      }
      if ((promotion.flashPriceCents ?? 0) >= item.basePriceCents) {
        badRequest('秒杀价必须低于菜品原价', 'INVALID_PROMOTION');
      }
    }
  }

  private async assertNoPublishedOverlap(promotion: PromotionCampaign, db: Database): Promise<void> {
    const rows = await db.collection<PromotionCampaignDoc>(collections.promotionCampaigns).list({
      where: {
        storeId: promotion.storeId,
        lifecycleStatus: 'published',
      },
    });
    const overlapping = rows.some((row) => (
      row.id !== promotion.id
      && row.type === promotion.type
      && (promotion.type !== 'item_flash' || row.menuItemId === promotion.menuItemId)
      && row.startsAt < promotion.endsAt
      && promotion.startsAt < row.endsAt
    ));
    if (overlapping) conflict('同一促销目标的发布时间段不能重叠', 'PROMOTION_OVERLAP');
  }

  private async bumpPromotionStoreRevision(storeId: string, db: Database): Promise<void> {
    const stores = db.collection<StoreDoc>(collections.stores);
    const store = await stores.get(storeId);
    if (!store) notFound('促销关联商家不存在', 'STORE_NOT_FOUND');
    // This deterministic shared write is the cross-instance mutex. CloudBase
    // retries a conflicting transaction, so the overlap query is evaluated
    // again against the winner's committed campaign before this mutation can
    // commit.
    await stores.update(store.id, {
      promotionPublishRevision: (store.promotionPublishRevision ?? 0) + 1,
      updatedAt: db.now().toISOString(),
    });
  }
}

function promotionStoreLockKey(storeId: string): string {
  return `store:${storeId}`;
}

async function withLocalPromotionPublishLock<T>(
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = localPromotionPublishLocks.get(key) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => gate);
  localPromotionPublishLocks.set(key, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (localPromotionPublishLocks.get(key) === queued) {
      localPromotionPublishLocks.delete(key);
    }
  }
}

function parsePromotion(value: unknown, idOverride?: string): PromotionCampaign {
  const input = object(value);
  const id = idOverride ?? optionalId(input.id) ?? `promotion_${randomUUID()}`;
  const type = promotionType(input.type);
  const lifecycleStatus = promotionStatus(input.lifecycleStatus);
  const startsAt = isoDate(input.startsAt, '开始时间');
  const endsAt = isoDate(input.endsAt, '结束时间');
  if (startsAt >= endsAt) badRequest('促销结束时间必须晚于开始时间', 'INVALID_PROMOTION');
  const base = {
    id,
    name: requiredString(input.name, '活动名称', 120),
    type,
    storeId: requiredString(input.storeId, '商家 ID', 80),
    startsAt,
    endsAt,
    lifecycleStatus,
    createdAt: '',
    updatedAt: '',
  };
  if (type === 'item_flash') {
    return {
      ...base,
      menuItemId: requiredString(input.menuItemId, '菜品 ID', 80),
      flashPriceCents: integer(input.flashPriceCents, '秒杀价', 0, 10_000_000),
    };
  }
  return {
    ...base,
    tiers: parseTiers(input.tiers),
  };
}

function parseTiers(value: unknown): PromotionThresholdTier[] {
  if (!Array.isArray(value) || !value.length || value.length > 20) {
    badRequest('满减阶梯需包含 1–20 档', 'INVALID_PROMOTION');
  }
  const tiers = value.map((raw) => {
    const tier = object(raw);
    const thresholdCents = integer(tier.thresholdCents, '满减门槛', 1, 10_000_000);
    const discountCents = integer(tier.discountCents, '满减金额', 1, thresholdCents);
    return { thresholdCents, discountCents };
  }).sort((left, right) => left.thresholdCents - right.thresholdCents);
  if (new Set(tiers.map((tier) => tier.thresholdCents)).size !== tiers.length) {
    badRequest('满减门槛不能重复', 'INVALID_PROMOTION');
  }
  return tiers;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    badRequest('请求内容格式不正确', 'INVALID_INPUT');
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    badRequest(`${label}格式不正确`, 'INVALID_INPUT');
  }
  return value.trim();
}

function optionalId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const id = requiredString(value, '活动 ID', 100);
  if (!/^[a-zA-Z0-9:_-]+$/.test(id)) badRequest('活动 ID 格式不正确', 'INVALID_INPUT');
  return id;
}

function integer(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    badRequest(`${label}格式不正确`, 'INVALID_INPUT');
  }
  return Number(value);
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') badRequest(`${label}格式不正确`, 'INVALID_INPUT');
  return value;
}

function probability(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    badRequest(`${label}必须在 0 到 1 之间`, 'INVALID_INPUT');
  }
  return value;
}

function promotionType(value: unknown): PromotionType {
  if (value === 'item_flash' || value === 'store_threshold') return value;
  badRequest('促销类型不正确', 'INVALID_PROMOTION');
}

function promotionStatus(value: unknown): PromotionLifecycleStatus {
  if (value === undefined || value === 'draft') return 'draft';
  if (value === 'published' || value === 'paused') return value;
  badRequest('促销状态不正确', 'INVALID_PROMOTION');
}

function isoDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    badRequest(`${label}格式不正确`, 'INVALID_INPUT');
  }
  return new Date(value).toISOString();
}
