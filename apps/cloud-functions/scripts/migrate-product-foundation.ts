import { createHash } from 'node:crypto';
import { collections } from '../src/collections';
import { DEFAULT_GAMEPLAY_CONFIG } from '../src/commerce';
import { createCloudBaseDatabase, type CollectionStore } from '../src/database';
import type {
  AdminAuditLogDoc,
  GameplayConfigDoc,
  ShareConfigDoc,
  ShareInviteDoc,
  ShareRewardDailyDoc,
  VirtualOrderDoc,
  VisitorSessionDoc,
  WalletTransactionDoc,
} from '../src/models';
import { sanitizeForAuditLog, sanitizeLogMessage } from '../src/redaction';
import { DEFAULT_SHARE_REWARD_CONFIG } from '../src/share-domain';
import { shanghaiBusinessDate } from '../src/business-time';
import { CLOUDBASE_SCHEMA_MANIFEST, validateSchemaManifest } from '../src/schema-manifest';

const APPLY = process.env.MIGRATION_APPLY === 'true';
const PAGE_SIZE = 100;

async function main() {
  const manifestFailures = validateSchemaManifest();
  if (manifestFailures.length) {
    throw new Error(`Invalid schema manifest: ${manifestFailures.join('; ')}`);
  }
  const db = createCloudBaseDatabase();
  const changes: string[] = [];
  const gameplay = db.collection<GameplayConfigDoc>(collections.gameplayConfigs);
  if (!await gameplay.get('default')) {
    changes.push('gameplay_configs/default: create');
    if (APPLY) {
      const now = db.now().toISOString();
      await gameplay.insert({ _id: 'default', ...DEFAULT_GAMEPLAY_CONFIG, updatedAt: now });
    }
  }

  const orders = db.collection<VirtualOrderDoc>(collections.virtualOrders);
  const orderRows = (await listAll(orders))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  const seenIdempotencyPairs = new Set<string>();
  for (const order of orderRows) {
    const subjectKey = order.subjectKey
      ?? (order.accountId
        ? `account:${order.accountId}`
        : order.visitorId
          ? `visitor:${order.visitorId}`
          : `legacy:order:${order.id}`);
    let idempotencyKey = order.idempotencyKey
      ?? `legacy_${sha256(order.id).slice(0, 40)}`;
    let pair = `${subjectKey}:${idempotencyKey}`;
    if (seenIdempotencyPairs.has(pair)) {
      idempotencyKey = `legacy_${sha256(`${order.id}:${idempotencyKey}`).slice(0, 40)}`;
      pair = `${subjectKey}:${idempotencyKey}`;
    }
    seenIdempotencyPairs.add(pair);
    const missingCheckoutMetadata = !(order.checkoutId && order.quoteId && order.idempotencyKey);
    const patch: Partial<VirtualOrderDoc> = {};
    if (order.subjectKey !== subjectKey) patch.subjectKey = subjectKey;
    if (order.idempotencyKey !== idempotencyKey) patch.idempotencyKey = idempotencyKey;
    if (missingCheckoutMetadata && order.legacyCreate !== true) patch.legacyCreate = true;
    if (!Object.keys(patch).length) continue;
    changes.push(`virtual_orders/${order.id}: backfill idempotency principal${missingCheckoutMetadata ? ' and mark legacyCreate' : ''}`);
    if (APPLY) await orders.update(order.id, patch);
  }

  const visitorSessions = db.collection<VisitorSessionDoc>(collections.visitorSessions);
  for (const session of await listAll(visitorSessions)) {
    if (session.accessTokenHash) continue;
    changes.push(`visitor_sessions/${session.id}: remove derivable legacy bearer session`);
    if (APPLY) await visitorSessions.remove(session.id);
  }

  const shares = db.collection<ShareInviteDoc>(collections.shareInvites);
  const rewardDaily = db.collection<ShareRewardDailyDoc>(collections.shareRewardDaily);
  const walletTransactions = db.collection<WalletTransactionDoc>(collections.walletTransactions);
  const shareConfig = (await db.collection<ShareConfigDoc>(collections.shareRewardConfigs).get('default'))
    ?.config ?? DEFAULT_SHARE_REWARD_CONFIG;
  const migrationBusinessDate = shanghaiBusinessDate();
  const rewardAggregates = new Map<string, {
    accountId: string;
    businessDate: string;
    knownCount: number;
    knownAmountCents: number;
    unknownCount: number;
  }>();
  for (const invite of await listAll(shares)) {
    if (!invite.initiatedRewardGranted) continue;
    const transactionId = `share_initiated_${sha256(`${invite.inviterAccountId}:${invite.token}`).slice(0, 40)}`;
    const rewardTransaction = await walletTransactions.get(transactionId);
    const knownRewardedAt = invite.rewardedAt
      ?? invite.initiatedRewardGrantedAt
      ?? rewardTransaction?.createdAt
      ?? null;
    const businessDate = knownRewardedAt
      ? shanghaiBusinessDate(new Date(knownRewardedAt))
      : migrationBusinessDate;
    const key = `${invite.inviterAccountId}:${businessDate}`;
    const aggregate = rewardAggregates.get(key) ?? {
      accountId: invite.inviterAccountId,
      businessDate,
      knownCount: 0,
      knownAmountCents: 0,
      unknownCount: 0,
    };
    if (knownRewardedAt) {
      aggregate.knownCount += 1;
      aggregate.knownAmountCents += rewardTransaction?.amountCents
        ?? shareConfig.initiatedRewardCents;
      if (!invite.rewardedAt
        || !invite.initiatedRewardGrantedAt
        || !invite.rewardBusinessDate
        || invite.rewardMigrationReviewRequired) {
        changes.push(`share_invites/${invite.token}: backfill reward from known grant timestamp`);
        if (APPLY) {
          await shares.update(invite.token, {
            initiatedRewardGrantedAt: knownRewardedAt,
            rewardedAt: knownRewardedAt,
            rewardBusinessDate: businessDate,
            rewardMigrationReviewRequired: false,
            rewardMigrationGuardBusinessDate: null,
          });
        }
      }
    } else {
      aggregate.unknownCount += 1;
      if (!invite.rewardMigrationReviewRequired
        || invite.rewardMigrationGuardBusinessDate !== businessDate) {
        changes.push(`share_invites/${invite.token}: flag unknown reward time for manual review`);
        if (APPLY) {
          await shares.update(invite.token, {
            rewardMigrationReviewRequired: true,
            rewardMigrationGuardBusinessDate: businessDate,
          });
        }
      }
    }
    rewardAggregates.set(key, aggregate);
  }
  for (const aggregate of rewardAggregates.values()) {
    const key = `${aggregate.accountId}:${aggregate.businessDate}`;
    const id = `share_reward_daily_${sha256(key).slice(0, 40)}`;
    const existing = await rewardDaily.get(id);
    const guardedCount = aggregate.unknownCount > 0
      ? shareConfig.dailyInitiatedLimit
      : aggregate.knownCount;
    const grantedCount = Math.max(existing?.grantedCount ?? 0, guardedCount, aggregate.knownCount);
    const totalAmountCents = Math.max(
      existing?.totalAmountCents ?? 0,
      aggregate.knownAmountCents,
    );
    const migrationGuardedUnknownCount = Math.max(
      existing?.migrationGuardedUnknownCount ?? 0,
      aggregate.unknownCount,
    );
    if (existing
      && existing.grantedCount === grantedCount
      && existing.totalAmountCents === totalAmountCents
      && (existing.migrationGuardedUnknownCount ?? 0) === migrationGuardedUnknownCount) {
      continue;
    }
    const next: ShareRewardDailyDoc = {
      _id: id,
      id,
      accountId: aggregate.accountId,
      businessDate: aggregate.businessDate,
      grantedCount,
      totalAmountCents,
      migrationGuardedUnknownCount,
      updatedAt: db.now().toISOString(),
    };
    changes.push(`share_reward_daily/${id}: aggregate known grants${aggregate.unknownCount ? ' and guard unknown timestamps' : ''}`);
    if (APPLY) {
      if (existing) await rewardDaily.update(id, next);
      else await rewardDaily.insert(next);
    }
  }

  const audits = db.collection<AdminAuditLogDoc>(collections.adminAuditLogs);
  for (const audit of await listAll(audits)) {
    const beforeData = sanitizeForAuditLog(audit.beforeData);
    const afterData = sanitizeForAuditLog(audit.afterData);
    if (JSON.stringify(beforeData) === JSON.stringify(audit.beforeData)
      && JSON.stringify(afterData) === JSON.stringify(audit.afterData)) continue;
    changes.push(`admin_audit_logs/${audit.id}: redact snapshot`);
    if (APPLY) await audits.update(audit.id, { beforeData, afterData });
  }

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    schema: {
      version: CLOUDBASE_SCHEMA_MANIFEST.version,
      collectionAccess: CLOUDBASE_SCHEMA_MANIFEST.collectionAccess,
      collections: CLOUDBASE_SCHEMA_MANIFEST.collections,
      managementPlaneApplyRequired: true,
      note: 'Run cloudbase:apply-schema in dry-run mode, then set CLOUDBASE_SCHEMA_APPLY=true to apply collections, indexes, and PRIVATE access before strict verification.',
    },
    changed: changes.length,
    changes,
  }, null, 2));
}

async function listAll<T extends Record<string, any>>(collection: CollectionStore<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const page = await collection.list({ skip, limit: PAGE_SIZE });
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

main().catch((error) => {
  console.error(sanitizeLogMessage(error instanceof Error ? error.message : 'Migration failed'));
  process.exit(1);
});
