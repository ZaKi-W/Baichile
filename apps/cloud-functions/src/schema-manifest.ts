import { collectionNames, collectionSpecs } from './collections';

export const CLOUDBASE_SCHEMA_MANIFEST = {
  version: '2026-07-28.product-foundation.v2',
  collectionAccess: 'PRIVATE',
  collections: collectionSpecs,
} as const;

export function validateSchemaManifest(): string[] {
  const failures: string[] = [];
  const names = CLOUDBASE_SCHEMA_MANIFEST.collections.map((spec) => spec.name);
  if (new Set(names).size !== names.length) failures.push('duplicate collection name');
  for (const name of collectionNames) {
    if (!names.includes(name)) failures.push(`missing collection spec: ${name}`);
  }
  for (const spec of CLOUDBASE_SCHEMA_MANIFEST.collections) {
    const indexNames = spec.indexes.map((index) => index.name);
    if (new Set(indexNames).size !== indexNames.length) {
      failures.push(`${spec.name}: duplicate index name`);
    }
    for (const index of spec.indexes) {
      if (!Object.keys(index.fields).length) failures.push(`${spec.name}/${index.name}: empty fields`);
    }
  }
  if (CLOUDBASE_SCHEMA_MANIFEST.collectionAccess !== 'PRIVATE') {
    failures.push('all application collections must use PRIVATE access');
  }
  requireIndex(failures, 'share_reward_daily', 'account_business_date_unique', {
    accountId: 1,
    businessDate: 1,
  }, true);
  requireIndex(failures, 'checkout_sessions', 'quote_id', { quoteId: 1 });
  requireIndex(failures, 'checkout_sessions', 'expires_at', { expiresAt: 1 });
  requireIndex(failures, 'checkout_sessions', 'checkout_expires', { checkoutExpiresAt: 1 });
  requireIndex(failures, 'virtual_orders', 'checkout_created', { checkoutId: 1, createdAt: -1 });
  requireIndex(failures, 'virtual_orders', 'checkout_store', {
    checkoutId: 1,
    storeId: 1,
  });
  requireIndex(failures, 'virtual_orders', 'subject_idempotency', {
    subjectKey: 1,
    idempotencyKey: 1,
  }, true);
  requireIndex(failures, 'virtual_orders', 'account_created_id', {
    accountId: 1,
    createdAt: -1,
    id: -1,
  });
  requireIndex(failures, 'virtual_orders', 'visitor_created_id', {
    visitorId: 1,
    createdAt: -1,
    id: -1,
  });
  requireIndex(failures, 'visitor_sessions', 'refresh_token_hash', { refreshTokenHash: 1 });
  return failures;
}

function requireIndex(
  failures: string[],
  collectionName: string,
  indexName: string,
  fields: Record<string, 1 | -1>,
  unique = false,
  sparse = false,
): void {
  const collection = CLOUDBASE_SCHEMA_MANIFEST.collections.find((spec) => spec.name === collectionName);
  const index = collection?.indexes.find((candidate) => candidate.name === indexName);
  if (!index
    || JSON.stringify(index.fields) !== JSON.stringify(fields)
    || Boolean(index.unique) !== unique
    || Boolean(index.sparse) !== sparse) {
    failures.push(`${collectionName}: missing or invalid ${indexName}`);
  }
}
