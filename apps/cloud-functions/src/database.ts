import { randomUUID } from 'node:crypto';

export type QueryScalar =
  | string
  | number
  | boolean
  | null
  | Date
  | undefined;

export interface QueryComparison {
  $eq?: QueryScalar;
  $neq?: QueryScalar;
  $lt?: QueryScalar;
  $lte?: QueryScalar;
  $gt?: QueryScalar;
  $gte?: QueryScalar;
  $in?: QueryScalar[];
}

export type QueryValue = QueryScalar | QueryScalar[] | QueryComparison;

export type Query = Record<string, QueryValue | Query[]>;

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

export type MemoryListObserver = (collectionName: string, options: ListOptions) => void;

export class MemoryDatabase implements Database {
  private readonly rows = new Map<string, Map<string, any>>();

  constructor(private readonly onList?: MemoryListObserver) {}

  collection<T extends Record<string, any>>(name: string): CollectionStore<T> {
    if (!this.rows.has(name)) this.rows.set(name, new Map());
    const bucket = this.rows.get(name)!;
    return new MemoryCollection<T>(bucket, (options) => this.onList?.(name, options));
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
  constructor(
    private readonly rows: Map<string, T>,
    private readonly onList?: (options: ListOptions) => void,
  ) {}

  async get(id: string): Promise<T | null> {
    return clone(this.rows.get(id) ?? null);
  }

  async findOne(where: Query): Promise<T | null> {
    return (await this.list({ where, limit: 1 }))[0] ?? null;
  }

  async list(options: ListOptions = {}): Promise<T[]> {
    this.onList?.(options);
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
  constructor(
    private readonly db: any,
    private readonly activeTransaction?: any,
  ) {}

  collection<T extends Record<string, any>>(name: string): CollectionStore<T> {
    return new CloudBaseCollection<T>(this.db, name, this.activeTransaction);
  }

  async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    if (this.activeTransaction) return fn(this);
    if (typeof this.db.startTransaction === 'function') {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const transaction = await this.db.startTransaction();
        try {
          const result = await fn(new CloudBaseDatabase(this.db, transaction));
          await transaction.commit();
          return result;
        } catch (error) {
          lastError = error;
          try {
            await transaction.rollback();
          } catch {
            // The original failure is more useful than a best-effort rollback failure.
          }
          if (isBusinessError(error) || attempt === 2) throw error;
        }
      }
      throw lastError;
    }
    if (typeof this.db.runTransaction === 'function') {
      let result: T | undefined;
      let callbackError: unknown;
      try {
        await this.db.runTransaction(async (transaction: any) => {
          callbackError = undefined;
          try {
            result = await fn(new CloudBaseDatabase(this.db, transaction));
          } catch (error) {
            callbackError = error;
            throw error;
          }
        });
      } catch (error) {
        if (callbackError) throw callbackError;
        throw error;
      }
      return result as T;
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
  constructor(
    private readonly db: any,
    private readonly name: string,
    private readonly activeTransaction?: any,
  ) {}

  async get(id: string): Promise<T | null> {
    const result = await this.collectionReference().doc(id).get();
    const data = normalizeData(result);
    return (data[0] ?? null) as T | null;
  }

  async findOne(where: Query): Promise<T | null> {
    return (await this.list({ where, limit: 1 }))[0] ?? null;
  }

  async list(options: ListOptions = {}): Promise<T[]> {
    if (options.limit !== undefined) return this.readPage(options);
    const rows: T[] = [];
    const pageSize = 100;
    const initialSkip = options.skip ?? 0;
    for (let offset = 0; ; offset += pageSize) {
      const page = await this.readPage({
        ...options,
        skip: initialSkip + offset,
        limit: pageSize,
      });
      rows.push(...page);
      if (page.length < pageSize) return rows;
    }
  }

  async count(where: Query = {}): Promise<number> {
    let ref = this.collectionReference();
    if (Object.keys(cleanWhere(where)).length) ref = ref.where(toCloudWhere(this.db, where));
    const result = await ref.count();
    return Number(result.total ?? 0);
  }

  async insert(row: T): Promise<T> {
    const id = String(row._id ?? row.id ?? randomUUID());
    const saved = { ...row, _id: id };
    if (this.activeTransaction) {
      if (await this.get(id)) throw new Error(`Duplicate id ${id}`);
      await this.collectionReference().doc(id).set(withoutDocumentId(saved));
      return saved as T;
    }
    // @cloudbase/node-sdk uses @cloudbase/database's `add(data)` signature
    // (not wx-server-sdk's `add({ data })`). A caller-supplied `_id` makes
    // this create-only; DocumentReference#set would silently upsert.
    const result = await this.db.collection(this.name).add(saved);
    if (result && typeof result === 'object' && 'code' in result && result.code) {
      throw new Error(`CloudBase insert failed: ${String(result.code)}`);
    }
    return saved as T;
  }

  async upsert(id: string, row: Partial<T>): Promise<T> {
    const saved = { ...row, _id: id };
    if (this.activeTransaction) {
      await this.collectionReference().doc(id).set(withoutDocumentId(saved));
      return saved as unknown as T;
    }
    await this.db.collection(this.name).doc(id).set(withoutDocumentId(saved));
    return (await this.get(id)) ?? saved as unknown as T;
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    if (this.activeTransaction) {
      const current = await this.get(id);
      if (!current) throw new Error(`Missing id ${id}`);
      await this.collectionReference().doc(id).update(withoutDocumentId(patch as Record<string, any>));
      return { ...current, ...patch };
    }
    await this.db.collection(this.name).doc(id).update(patch);
    const saved = await this.get(id);
    if (!saved) throw new Error(`Missing id ${id}`);
    return saved;
  }

  async remove(id: string): Promise<void> {
    if (this.activeTransaction) {
      await this.collectionReference().doc(id).remove();
      return;
    }
    await this.db.collection(this.name).doc(id).remove();
  }

  private async readPage(options: ListOptions): Promise<T[]> {
    let ref = this.collectionReference();
    if (options.where && Object.keys(cleanWhere(options.where)).length) {
      ref = ref.where(toCloudWhere(this.db, options.where));
    }
    for (const [field, direction] of options.orderBy ?? []) ref = ref.orderBy(field, direction);
    if (options.skip) ref = ref.skip(options.skip);
    if (options.limit !== undefined) ref = ref.limit(options.limit);
    const result = await ref.get();
    return normalizeData(result) as T[];
  }

  private collectionReference(): any {
    return this.activeTransaction
      ? this.activeTransaction.collection(this.name)
      : this.db.collection(this.name);
  }
}

function isBusinessError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && (error as { name?: unknown }).name === 'CloudApiError',
  );
}

function normalizeData(result: any): any[] {
  if (Array.isArray(result?.data)) return result.data;
  if (result?.data) return [result.data];
  return [];
}

function cleanWhere(where: Query): Query {
  return Object.fromEntries(Object.entries(where).filter(([, value]) => value !== undefined));
}

function toCloudWhere(db: any, where: Query): any {
  const command = db.command;
  const clauses: any[] = [];
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cleanWhere(where))) {
    if (key === '$or') {
      if (!Array.isArray(value) || !value.length) continue;
      clauses.push(command.or(value.map((branch) => toCloudWhere(db, branch as Query))));
      continue;
    }
    fields[key] = toCloudQueryValue(command, value as QueryValue);
  }
  if (Object.keys(fields).length) clauses.unshift(fields);
  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0];
  return command.and(clauses);
}

function toCloudQueryValue(command: any, value: QueryValue): unknown {
  if (!isQueryComparison(value)) return value;
  const operations = Object.entries(value)
    .filter(([, operand]) => operand !== undefined);
  if (!operations.length) return value;
  let result: any;
  for (const [operator, operand] of operations) {
    const method = operator.slice(1);
    if (typeof command[method] !== 'function') throw new Error(`Unsupported query operator ${operator}`);
    result = result === undefined
      ? command[method](operand)
      : result[method](operand);
  }
  return result;
}

function withoutDocumentId<T extends Record<string, any>>(row: T): Omit<T, '_id'> {
  const { _id: _, ...rest } = row;
  return rest;
}

function matches(row: Record<string, any>, where: Query): boolean {
  return Object.entries(cleanWhere(where)).every(([key, expected]) => {
    if (key === '$or') {
      return Array.isArray(expected)
        && expected.some((branch) => matches(row, branch as Query));
    }
    const actual = row[key];
    if (isQueryComparison(expected)) return matchesComparison(actual, expected);
    if (Array.isArray(expected)) return expected.includes(actual);
    return actual === expected;
  });
}

function isQueryComparison(value: unknown): value is QueryComparison {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && !(value instanceof Date)
    && Object.keys(value).some((key) => key.startsWith('$')),
  );
}

function matchesComparison(actual: unknown, comparison: QueryComparison): boolean {
  if ('$eq' in comparison && actual !== comparison.$eq) return false;
  if ('$neq' in comparison && actual === comparison.$neq) return false;
  if ('$lt' in comparison && compareValues(actual, comparison.$lt) >= 0) return false;
  if ('$lte' in comparison && compareValues(actual, comparison.$lte) > 0) return false;
  if ('$gt' in comparison && compareValues(actual, comparison.$gt) <= 0) return false;
  if ('$gte' in comparison && compareValues(actual, comparison.$gte) < 0) return false;
  if (comparison.$in && !comparison.$in.includes(actual as QueryScalar)) return false;
  return true;
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
