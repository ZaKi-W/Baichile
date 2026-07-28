import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { collectionNames, collections } from '../src/collections';
import { createCloudBaseDatabase, type CollectionStore } from '../src/database';
import { sanitizeForAuditLog, sanitizeLogMessage } from '../src/redaction';
import { DEFAULT_SHARE_REWARD_CONFIG } from '../src/share-domain';
import { CLOUDBASE_SCHEMA_MANIFEST, validateSchemaManifest } from '../src/schema-manifest';

const PAGE_SIZE = 100;

async function main() {
  const dataOnly = process.env.CLOUDBASE_VERIFY_DATA_ONLY === 'true';
  const schemaStatePath = process.env.CLOUDBASE_SCHEMA_STATE_FILE
    ? resolve(process.env.CLOUDBASE_SCHEMA_STATE_FILE)
    : '';
  const input = process.env.CLOUDBASE_EXPORT_FILE ? resolve(process.env.CLOUDBASE_EXPORT_FILE) : '';
  const expected = input && existsSync(input)
    ? JSON.parse(readFileSync(input, 'utf8')) as Record<string, Array<Record<string, unknown>>>
    : null;
  const db = createCloudBaseDatabase();
  const failures: string[] = validateSchemaManifest().map((failure) => `schema manifest: ${failure}`);
  if (input && !existsSync(input)) failures.push(`export file not found: ${input}`);
  if (schemaStatePath) {
    if (!existsSync(schemaStatePath)) {
      failures.push(`management schema state file not found: ${schemaStatePath}`);
    } else {
      const state = JSON.parse(readFileSync(schemaStatePath, 'utf8')) as unknown;
      failures.push(...verifyManagementSchemaState(state));
    }
  } else if (!dataOnly) {
    failures.push(
      'management schema state is required: set CLOUDBASE_SCHEMA_STATE_FILE, '
      + 'or explicitly opt into non-schema verification with CLOUDBASE_VERIFY_DATA_ONLY=true',
    );
  }

  for (const spec of CLOUDBASE_SCHEMA_MANIFEST.collections) {
    try {
      await db.collection(spec.name).count();
    } catch {
      failures.push(`schema collection unavailable: ${spec.name}`);
    }
  }
  if (dataOnly && !schemaStatePath) {
    console.warn(
      `Schema ${CLOUDBASE_SCHEMA_MANIFEST.version}: DATA-ONLY mode; indexes and PRIVATE access were not verified.`,
    );
  }

  for (const name of collectionNames) {
    if (!expected || !(name in expected)) continue;
    const expectedCount = expected[name]?.length ?? 0;
    const actualCount = await db.collection(name).count();
    if (actualCount !== expectedCount) failures.push(`${name}: expected ${expectedCount}, got ${actualCount}`);
  }

  const accounts = await listAll(db.collection<Record<string, unknown>>('accounts'));
  const transactions = await listAll(db.collection<Record<string, unknown>>('wallet_transactions'));
  for (const account of accounts) {
    const balance = transactions
      .filter((tx) => tx.accountId === account.id)
      .reduce((sum, tx) => sum + Number(tx.amountCents ?? 0), 0);
    if (balance !== Number(account.balanceCents ?? 0)) {
      failures.push(`account ${account.id}: balance ${account.balanceCents}, tx sum ${balance}`);
    }
  }

  const stores = new Set((await listAll(db.collection<Record<string, unknown>>('stores'))).map((row) => row.id));
  const menuItems = await listAll(db.collection<Record<string, unknown>>('menu_items'));
  for (const item of menuItems) {
    if (!stores.has(item.storeId)) failures.push(`menu item ${item.id}: missing store ${item.storeId}`);
  }

  const orders = await listAll(db.collection<Record<string, unknown>>('virtual_orders'));
  const orderIdempotencyPairs = new Set<string>();
  for (const order of orders) {
    if (!stores.has(order.storeId)) failures.push(`order ${order.id}: missing store ${order.storeId}`);
    const hasCheckoutMetadata = ['checkoutId', 'quoteId', 'idempotencyKey']
      .every((field) => typeof order[field] === 'string' && order[field]);
    if (!hasCheckoutMetadata && order.legacyCreate !== true) {
      failures.push(`order ${order.id}: missing checkout metadata and legacyCreate marker`);
    }
    if (typeof order.subjectKey !== 'string' || !order.subjectKey
      || typeof order.idempotencyKey !== 'string' || !order.idempotencyKey) {
      failures.push(`order ${order.id}: missing subject/idempotency key`);
    } else {
      const pair = `${order.subjectKey}:${order.idempotencyKey}`;
      if (orderIdempotencyPairs.has(pair)) {
        failures.push(`order ${order.id}: duplicate subject/idempotency key`);
      }
      orderIdempotencyPairs.add(pair);
    }
  }

  const gameplay = await db.collection<Record<string, unknown>>(collections.gameplayConfigs).get('default');
  if (!gameplay) failures.push('gameplay_configs/default: missing');
  else {
    for (const field of ['deliveryIncidentRate', 'successEggRate']) {
      const value = gameplay[field];
      if (typeof value !== 'number' || value < 0 || value > 1) {
        failures.push(`gameplay_configs/default: invalid ${field}`);
      }
    }
    if (typeof gameplay.firstCheckoutGuaranteed !== 'boolean') {
      failures.push('gameplay_configs/default: invalid firstCheckoutGuaranteed');
    }
  }

  const promotions = await listAll(db.collection<Record<string, unknown>>(collections.promotionCampaigns));
  const menuIds = new Set(menuItems.map((item) => item.id));
  for (const promotion of promotions) {
    if (!stores.has(promotion.storeId)) failures.push(`promotion ${promotion.id}: missing store ${promotion.storeId}`);
    if (promotion.type === 'item_flash' && !menuIds.has(promotion.menuItemId)) {
      failures.push(`promotion ${promotion.id}: missing menu item ${promotion.menuItemId}`);
    }
    if (typeof promotion.startsAt !== 'string' || typeof promotion.endsAt !== 'string'
      || promotion.startsAt >= promotion.endsAt) {
      failures.push(`promotion ${promotion.id}: invalid active interval`);
    }
  }

  const checkouts = await listAll(db.collection<Record<string, unknown>>(collections.checkoutSessions));
  for (const checkout of checkouts) {
    if (typeof checkout.quoteId !== 'string'
      || typeof checkout.expiresAt !== 'string'
      || typeof checkout.checkoutExpiresAt !== 'string'
      || !Array.isArray(checkout.createdOrderIds)
      || !Array.isArray(checkout.createdStoreIds)) {
      failures.push(`checkout ${checkout.id}: incomplete quote/session fields`);
    }
  }

  const dailyRewards = await listAll(db.collection<Record<string, unknown>>(collections.shareRewardDaily));
  const dailyKeys = new Set<string>();
  const dailyByKey = new Map<string, Record<string, unknown>>();
  for (const daily of dailyRewards) {
    const key = `${daily.accountId}:${daily.businessDate}`;
    if (dailyKeys.has(key)) failures.push(`share_reward_daily: duplicate ${key}`);
    dailyKeys.add(key);
    dailyByKey.set(key, daily);
    const expectedId = `share_reward_daily_${sha256(key).slice(0, 40)}`;
    if (daily.id !== expectedId || daily._id !== expectedId) {
      failures.push(`share_reward_daily ${daily.id}: non-deterministic id`);
    }
  }
  const shareConfig = await db.collection<Record<string, unknown>>(collections.shareRewardConfigs).get('default');
  const dailyLimit = Number(
    (shareConfig?.config as Record<string, unknown> | undefined)?.dailyInitiatedLimit
      ?? DEFAULT_SHARE_REWARD_CONFIG.dailyInitiatedLimit,
  );
  const knownRewardCounts = new Map<string, number>();
  const shareInvites = await listAll(db.collection<Record<string, unknown>>(collections.shareInvites));
  for (const invite of shareInvites) {
    if (invite.initiatedRewardGranted !== true) continue;
    if (typeof invite.rewardedAt === 'string' && typeof invite.rewardBusinessDate === 'string') {
      const key = `${invite.inviterAccountId}:${invite.rewardBusinessDate}`;
      knownRewardCounts.set(key, (knownRewardCounts.get(key) ?? 0) + 1);
      continue;
    }
    if (invite.rewardMigrationReviewRequired !== true
      || typeof invite.rewardMigrationGuardBusinessDate !== 'string') {
      failures.push(`share invite ${invite.token}: granted reward has no known timestamp or migration guard`);
      continue;
    }
    const guardKey = `${invite.inviterAccountId}:${invite.rewardMigrationGuardBusinessDate}`;
    if (Number(dailyByKey.get(guardKey)?.grantedCount ?? 0) < dailyLimit) {
      failures.push(`share invite ${invite.token}: unknown reward timestamp is not guarded at daily limit`);
    }
  }
  for (const [key, count] of knownRewardCounts) {
    if (Number(dailyByKey.get(key)?.grantedCount ?? 0) < count) {
      failures.push(`share_reward_daily ${key}: known grant count is under-reported`);
    }
  }

  const visitorSessions = await listAll(db.collection<Record<string, unknown>>(collections.visitorSessions));
  for (const session of visitorSessions) {
    if (typeof session.accessTokenHash !== 'string'
      || typeof session.refreshTokenHash !== 'string'
      || typeof session.expiresAt !== 'string'
      || session._id !== `guest_session_${session.accessTokenHash}`) {
      failures.push(`visitor session ${session.id}: invalid token hash/expiry fields`);
    }
  }

  const audits = await listAll(db.collection<Record<string, unknown>>(collections.adminAuditLogs));
  for (const audit of audits) {
    if (JSON.stringify(sanitizeForAuditLog(audit.beforeData)) !== JSON.stringify(audit.beforeData)
      || JSON.stringify(sanitizeForAuditLog(audit.afterData)) !== JSON.stringify(audit.afterData)) {
      failures.push(`admin audit ${audit.id}: contains unredacted sensitive data`);
    }
  }

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('CloudBase verification passed.');
}

function verifyManagementSchemaState(value: unknown): string[] {
  const failures: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ['management schema state: root must be an object'];
  }
  const rawCollections = (value as Record<string, unknown>).collections;
  const stateCollections = Array.isArray(rawCollections)
    ? rawCollections
    : rawCollections && typeof rawCollections === 'object'
      ? Object.entries(rawCollections as Record<string, unknown>).map(([name, row]) => ({
        ...(row && typeof row === 'object' ? row as Record<string, unknown> : {}),
        name,
      }))
      : [];
  if (!stateCollections.length) {
    return ['management schema state: collections must be a non-empty array or object'];
  }
  for (const expected of CLOUDBASE_SCHEMA_MANIFEST.collections) {
    const actual = stateCollections.find((row) => (
      row && typeof row === 'object' && (row as Record<string, unknown>).name === expected.name
    )) as Record<string, unknown> | undefined;
    if (!actual) {
      failures.push(`management schema: missing collection ${expected.name}`);
      continue;
    }
    const access = actual.access ?? actual.accessMode ?? actual.permission;
    if (access !== CLOUDBASE_SCHEMA_MANIFEST.collectionAccess) {
      failures.push(`management schema: ${expected.name} access must be PRIVATE, got ${String(access)}`);
    }
    const indexes = Array.isArray(actual.indexes) ? actual.indexes : [];
    for (const expectedIndex of expected.indexes) {
      const actualIndex = indexes.find((row) => (
        row && typeof row === 'object'
        && (row as Record<string, unknown>).name === expectedIndex.name
      )) as Record<string, unknown> | undefined;
      if (!actualIndex) {
        failures.push(`management schema: ${expected.name} missing index ${expectedIndex.name}`);
        continue;
      }
      if (JSON.stringify(actualIndex.fields) !== JSON.stringify(expectedIndex.fields)
        || Boolean(actualIndex.unique) !== Boolean(expectedIndex.unique)
        || Boolean(actualIndex.sparse) !== Boolean(expectedIndex.sparse)) {
        failures.push(`management schema: ${expected.name}/${expectedIndex.name} definition mismatch`);
      }
    }
  }
  return failures;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function listAll<T extends Record<string, unknown>>(collection: CollectionStore<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const page = await collection.list({ skip, limit: PAGE_SIZE });
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

main().catch((error) => {
  console.error(sanitizeLogMessage(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
