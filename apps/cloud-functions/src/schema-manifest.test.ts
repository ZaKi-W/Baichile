import { describe, expect, it } from 'vitest';
import {
  buildManagementCollectionState,
  createIndexRequest,
  indexDefinitionMismatch,
  normalizeManagementIndex,
} from './schema-management';
import { CLOUDBASE_SCHEMA_MANIFEST, validateSchemaManifest } from './schema-manifest';

describe('CloudBase schema manifest', () => {
  it('contains the product-foundation and stable-pagination invariants', () => {
    expect(validateSchemaManifest()).toEqual([]);
    const orders = CLOUDBASE_SCHEMA_MANIFEST.collections
      .find((collection) => collection.name === 'virtual_orders');
    const checkouts = CLOUDBASE_SCHEMA_MANIFEST.collections
      .find((collection) => collection.name === 'checkout_sessions');

    expect(orders?.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'subject_idempotency',
        fields: { subjectKey: 1, idempotencyKey: 1 },
        unique: true,
      }),
      expect.objectContaining({
        name: 'account_created_id',
        fields: { accountId: 1, createdAt: -1, id: -1 },
      }),
      expect.objectContaining({
        name: 'checkout_store',
        fields: { checkoutId: 1, storeId: 1 },
      }),
    ]));
    expect(checkouts?.indexes).toContainEqual({
      name: 'expires_at',
      fields: { expiresAt: 1 },
    });
    expect(CLOUDBASE_SCHEMA_MANIFEST.collectionAccess).toBe('PRIVATE');
  });

  it('normalizes and compares management-plane index definitions', () => {
    const expected = {
      name: 'subject_idempotency',
      fields: { subjectKey: 1 as const, idempotencyKey: 1 as const },
      unique: true,
    };
    const actual = normalizeManagementIndex({
      Name: expected.name,
      Unique: true,
      Keys: [
        { Name: 'subjectKey', Direction: '1' },
        { Name: 'idempotencyKey', Direction: '1' },
      ],
    });
    expect(actual).not.toBeNull();
    expect(indexDefinitionMismatch(expected, actual!)).toBeNull();
    expect(createIndexRequest(expected)).toEqual({
      IndexName: expected.name,
      MgoKeySchema: {
        MgoIndexKeys: [
          { Name: 'subjectKey', Direction: '1' },
          { Name: 'idempotencyKey', Direction: '1' },
        ],
        MgoIsUnique: true,
        MgoIsSparse: false,
      },
    });
  });

  it('retains declared sparse state when the engine omits sparse metadata', () => {
    const spec = CLOUDBASE_SCHEMA_MANIFEST.collections
      .find((collection) => collection.name === 'accounts')!;
    const state = buildManagementCollectionState(spec, 'PRIVATE', [{
      Name: 'phone_hash_unique',
      Unique: true,
      Keys: [{ Name: 'phoneHash', Direction: '1' }],
    }]);
    expect(state.indexes.find((index) => index.name === 'phone_hash_unique')).toEqual({
      name: 'phone_hash_unique',
      fields: { phoneHash: 1 },
      unique: true,
      sparse: true,
    });
    expect(state.indexes.some((index) => index.name === 'created_at_desc')).toBe(false);
  });
});
