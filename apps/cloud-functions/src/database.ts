import { randomUUID } from 'node:crypto';

export type QueryValue =
  | string
  | number
  | boolean
  | null
  | Date
  | undefined
  | Array<string | number | boolean>;

export type Query = Record<string, QueryValue>;

export interface ListOptions {
  where?: Query;
  orderBy?: Array<[string, 'asc' | 'desc']>;
  skip?: number;
  limit?: number;
}

export interface CollectionStore<T extends Record<string, any>> {
  get(id: string): Promise<T | null>;
  findOne(where: Query): Promise<T | null>;
  list(options?: ListOptions): Promise<T[]>;
  count(where?: Query): Promise<number>;
  insert(row: T): Promise<T>;
  upsert(id: string, row: Partial<T>): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

export interface Database {
  collection<T extends Record<string, any>>(name: string): CollectionStore<T>;
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
  now(): Date;
  id(): string;
}

export class MemoryDatabase implements Database {
  private readonly rows = new Map<string, Map<string, any>>();

  collection<T extends Record<string, any>>(name: string): CollectionStore<T> {
    if (!this.rows.has(name)) this.rows.set(name, new Map());
    const bucket = this.rows.get(name)!;
    return new MemoryCollection<T>(bucket);
  }

  async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    const snapshot = new Map<string, Map<string, any>>();
    for (const [name, bucket] of this.rows.entries()) {
      snapshot.set(name, new Map([...bucket.entries()].map(([id, row]) => [id, structuredClone(row)])));
    }
    try {
      return await fn(this);
    } catch (error) {
      this.rows.clear();
      for (const [name, bucket] of snapshot.entries()) this.rows.set(name, bucket);
      throw error;
    }
  }

  now(): Date {
    return new Date();
  }

  id(): string {
    return randomUUID();
  }
}

class MemoryCollection<T extends Record<string, any>> implements CollectionStore<T> {
  constructor(private readonly rows: Map<string, T>) {}

  async get(id: string): Promise<T | null> {
    return clone(this.rows.get(id) ?? null);
  }

  async findOne(where: Query): Promise<T | null> {
    return (await this.list({ where, limit: 1 }))[0] ?? null;
  }

  async list(options: ListOptions = {}): Promise<T[]> {
    const filtered = [...this.rows.values()].filter((row) => matches(row, options.where ?? {}));
    for (const [field, direction] of [...(options.orderBy ?? [])].reverse()) {
      filtered.sort((a, b) => compareValues(a[field], b[field]) * (direction === 'asc' ? 1 : -1));
    }
    const start = options.skip ?? 0;
    const end = options.limit === undefined ? undefined : start + options.limit;
    return clone(filtered.slice(start, end));
  }

  async count(where: Query = {}): Promise<number> {
    return [...this.rows.values()].filter((row) => matches(row, where)).length;
  }

  async insert(row: T): Promise<T> {
    const id = String(row._id ?? row.id ?? randomUUID());
    if (this.rows.has(id)) throw new Error(`Duplicate id ${id}`);
    const saved = { ...row, _id: id };
    this.rows.set(id, saved as T);
    return clone(saved as T);
  }

  async upsert(id: string, row: Partial<T>): Promise<T> {
    const current = this.rows.get(id) ?? { _id: id, id };
    const saved = { ...current, ...row, _id: id };
    this.rows.set(id, saved as T);
    return clone(saved as T);
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const current = this.rows.get(id);
    if (!current) throw new Error(`Missing id ${id}`);
    const saved = { ...current, ...patch };
    this.rows.set(id, saved as T);
    return clone(saved as T);
  }

  async remove(id: string): Promise<void> {
    this.rows.delete(id);
  }
}

export function createCloudBaseDatabase(cloudbaseApp?: any): Database {
  const app = cloudbaseApp ?? createDefaultCloudBaseApp();
  const db = app.database();
  return new CloudBaseDatabase(db);
}

function createDefaultCloudBaseApp(): any {
  const mod = require('@cloudbase/node-sdk');
  return mod.init({
    env: process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || undefined,
  });
}

class CloudBaseDatabase implements Database {
  constructor(private readonly db: any) {}

  collection<T extends Record<string, any>>(name: string): CollectionStore<T> {
    return new CloudBaseCollection<T>(this.db, name);
  }

  async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    if (typeof this.db.runTransaction === 'function') {
      return this.db.runTransaction(async (transaction: any) => fn(new CloudBaseDatabase(transaction)));
    }
    return fn(this);
  }

  now(): Date {
    return new Date();
  }

  id(): string {
    return randomUUID();
  }
}

class CloudBaseCollection<T extends Record<string, any>> implements CollectionStore<T> {
  constructor(private readonly db: any, private readonly name: string) {}

  async get(id: string): Promise<T | null> {
    const result = await this.db.collection(this.name).doc(id).get();
    const data = normalizeData(result);
    return (data[0] ?? null) as T | null;
  }

  async findOne(where: Query): Promise<T | null> {
    return (await this.list({ where, limit: 1 }))[0] ?? null;
  }

  async list(options: ListOptions = {}): Promise<T[]> {
    let ref = this.db.collection(this.name);
    if (options.where && Object.keys(cleanWhere(options.where)).length) {
      ref = ref.where(cleanWhere(options.where));
    }
    for (const [field, direction] of options.orderBy ?? []) ref = ref.orderBy(field, direction);
    if (options.skip) ref = ref.skip(options.skip);
    if (options.limit) ref = ref.limit(options.limit);
    const result = await ref.get();
    return normalizeData(result) as T[];
  }

  async count(where: Query = {}): Promise<number> {
    let ref = this.db.collection(this.name);
    if (Object.keys(cleanWhere(where)).length) ref = ref.where(cleanWhere(where));
    const result = await ref.count();
    return Number(result.total ?? 0);
  }

  async insert(row: T): Promise<T> {
    const id = String(row._id ?? row.id ?? randomUUID());
    const saved = { ...row, _id: id };
    await this.db.collection(this.name).doc(id).set(withoutDocumentId(saved));
    return saved as T;
  }

  async upsert(id: string, row: Partial<T>): Promise<T> {
    const saved = { ...row, _id: id };
    await this.db.collection(this.name).doc(id).set(withoutDocumentId(saved));
    return (await this.get(id)) ?? saved as unknown as T;
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    await this.db.collection(this.name).doc(id).update(patch);
    const saved = await this.get(id);
    if (!saved) throw new Error(`Missing id ${id}`);
    return saved;
  }

  async remove(id: string): Promise<void> {
    await this.db.collection(this.name).doc(id).remove();
  }
}

function normalizeData(result: any): any[] {
  if (Array.isArray(result?.data)) return result.data;
  if (result?.data) return [result.data];
  return [];
}

function cleanWhere(where: Query): Query {
  return Object.fromEntries(Object.entries(where).filter(([, value]) => value !== undefined));
}

function withoutDocumentId<T extends Record<string, any>>(row: T): Omit<T, '_id'> {
  const { _id: _, ...rest } = row;
  return rest;
}

function matches(row: Record<string, any>, where: Query): boolean {
  return Object.entries(cleanWhere(where)).every(([key, expected]) => {
    const actual = row[key];
    if (Array.isArray(expected)) return expected.includes(actual);
    return actual === expected;
  });
}

function compareValues(a: unknown, b: unknown): number {
  const left = a instanceof Date ? a.getTime() : typeof a === 'string' ? a : Number(a ?? 0);
  const right = b instanceof Date ? b.getTime() : typeof b === 'string' ? b : Number(b ?? 0);
  return left < right ? -1 : left > right ? 1 : 0;
}

function clone<T>(value: T): T {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}
