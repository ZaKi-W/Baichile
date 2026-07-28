import { describe, expect, it } from 'vitest';
import { createCloudBaseDatabase } from './database';

describe('CloudBase database adapter', () => {
  it('uses @cloudbase/node-sdk add(data) for create-only inserts and set for upserts', async () => {
    const rows = new Map<string, Record<string, unknown>>();
    const calls: string[] = [];
    const collection = {
      add: async (row: Record<string, unknown>) => {
        calls.push('add');
        const id = String(row._id);
        if (rows.has(id)) throw new Error('duplicate key');
        rows.set(id, { ...row });
        return { id, requestId: 'request-1' };
      },
      doc: (id: string) => ({
        set: async (row: Record<string, unknown>) => {
          calls.push('set');
          rows.set(id, { ...row, _id: id });
        },
        get: async () => ({ data: rows.has(id) ? [rows.get(id)] : [] }),
        update: async (patch: Record<string, unknown>) => {
          rows.set(id, { ...rows.get(id), ...patch });
        },
        remove: async () => rows.delete(id),
      }),
    };
    const db = createCloudBaseDatabase({
      database: () => ({ collection: () => collection }),
    });
    const store = db.collection<{ _id: string; id: string; value: number }>('rows');

    await store.insert({ _id: 'fixed', id: 'fixed', value: 1 });
    await expect(store.insert({ _id: 'fixed', id: 'fixed', value: 2 })).rejects.toThrow('duplicate');
    await store.upsert('fixed', { id: 'fixed', value: 3 });

    expect(calls).toEqual(['add', 'add', 'set']);
    expect(await store.get('fixed')).toMatchObject({ _id: 'fixed', value: 3 });
  });

  it('paginates list calls without silently truncating at the CloudBase page cap', async () => {
    const source = Array.from({ length: 205 }, (_, index) => ({ _id: String(index), id: String(index) }));
    const requestedPages: Array<{ skip: number; limit: number }> = [];
    const makeQuery = (state = { skip: 0, limit: 100 }) => ({
      where: () => makeQuery(state),
      orderBy: () => makeQuery(state),
      skip: (skip: number) => makeQuery({ ...state, skip }),
      limit: (limit: number) => makeQuery({ ...state, limit }),
      get: async () => {
        requestedPages.push(state);
        return { data: source.slice(state.skip, state.skip + state.limit) };
      },
    });
    const db = createCloudBaseDatabase({
      database: () => ({ collection: () => makeQuery() }),
    });

    const rows = await db.collection<{ _id: string; id: string }>('rows').list();

    expect(rows).toHaveLength(205);
    expect(requestedPages).toEqual([
      { skip: 0, limit: 100 },
      { skip: 100, limit: 100 },
      { skip: 200, limit: 100 },
    ]);
  });

  it('adapts the Node SDK document transaction API and preserves callback results', async () => {
    const rows = new Map<string, Record<string, unknown>>([
      ['fixed', { _id: 'fixed', id: 'fixed', value: 1 }],
    ]);
    const collection = {
      doc: (id: string) => ({
        get: async () => ({ data: rows.has(id) ? [rows.get(id)] : [] }),
        update: async (patch: Record<string, unknown>) => {
          rows.set(id, { ...rows.get(id), ...patch });
        },
        set: async (row: Record<string, unknown>) => {
          rows.set(id, { ...row, _id: id });
        },
        remove: async () => rows.delete(id),
      }),
      add: async (row: Record<string, unknown>) => rows.set(String(row._id), row),
    };
    const transaction = {
      collection: () => collection,
      commit: async () => undefined,
      rollback: async () => undefined,
    };
    const database = {
      collection: () => collection,
      startTransaction: async () => transaction,
    };
    const db = createCloudBaseDatabase({ database: () => database });

    const result = await db.transaction(async (tx) => {
      const store = tx.collection<{ _id: string; id: string; value: number }>('rows');
      const current = await store.get('fixed');
      await store.update('fixed', { value: (current?.value ?? 0) + 1 });
      return 'committed';
    });

    expect(result).toBe('committed');
    expect(rows.get('fixed')).toMatchObject({ value: 2 });
  });
});
