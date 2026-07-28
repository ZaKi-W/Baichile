import type { CollectionSpec } from './collections';

export interface ManagementIndex {
  name: string;
  fields: Record<string, 1 | -1>;
  unique: boolean;
  sparse?: boolean;
}

export interface ManagementCollectionState {
  name: string;
  access: string;
  indexes: ManagementIndex[];
}

export interface RawManagementIndex {
  Name?: unknown;
  Keys?: unknown;
  Unique?: unknown;
  Sparse?: unknown;
  IsSparse?: unknown;
  MgoIsSparse?: unknown;
}

export function normalizeManagementIndex(value: RawManagementIndex): ManagementIndex | null {
  if (typeof value.Name !== 'string' || !Array.isArray(value.Keys)) return null;
  const fields: Record<string, 1 | -1> = {};
  for (const key of value.Keys) {
    if (!key || typeof key !== 'object') return null;
    const row = key as Record<string, unknown>;
    if (typeof row.Name !== 'string') return null;
    const direction = Number(row.Direction);
    if (direction !== 1 && direction !== -1) return null;
    fields[row.Name] = direction;
  }
  const sparseValue = value.Sparse ?? value.IsSparse ?? value.MgoIsSparse;
  return {
    name: value.Name,
    fields,
    unique: value.Unique === true || value.Unique === 'true' || value.Unique === 1,
    ...(typeof sparseValue === 'boolean' ? { sparse: sparseValue } : {}),
  };
}

export function indexDefinitionMismatch(
  expected: CollectionSpec['indexes'][number],
  actual: ManagementIndex,
): string | null {
  if (JSON.stringify(actual.fields) !== JSON.stringify(expected.fields)) return 'fields';
  if (actual.unique !== Boolean(expected.unique)) return 'unique';
  if (actual.sparse !== undefined && actual.sparse !== Boolean(expected.sparse)) return 'sparse';
  return null;
}

export function createIndexRequest(index: CollectionSpec['indexes'][number]) {
  return {
    IndexName: index.name,
    MgoKeySchema: {
      MgoIndexKeys: Object.entries(index.fields).map(([Name, Direction]) => ({
        Name,
        Direction: String(Direction),
      })),
      MgoIsUnique: Boolean(index.unique),
      MgoIsSparse: Boolean(index.sparse),
    },
  };
}

export function buildManagementCollectionState(
  spec: CollectionSpec,
  access: string,
  rawIndexes: RawManagementIndex[],
): ManagementCollectionState {
  const actualByName = new Map(
    rawIndexes
      .map(normalizeManagementIndex)
      .filter((index): index is ManagementIndex => Boolean(index))
      .map((index) => [index.name, index]),
  );
  return {
    name: spec.name,
    access,
    indexes: spec.indexes.flatMap((expected) => {
      const actual = actualByName.get(expected.name);
      if (!actual) return [];
      return [{
        name: expected.name,
        fields: actual.fields,
        unique: actual.unique,
        // DescribeTable omits sparse on some CloudBase engine versions. The
        // apply request always sends MgoIsSparse, so retain the declared value
        // when that response field is unavailable.
        sparse: actual.sparse ?? Boolean(expected.sparse),
      }];
    }),
  };
}
