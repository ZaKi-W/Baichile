# PostgreSQL Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Baichile guest identities, accounts, addresses, and virtual orders in PostgreSQL/PostGIS without changing the mini-program API contract.

**Architecture:** NestJS configures one TypeORM connection from `DATABASE_URL`, with explicit entities and migrations and with schema synchronization disabled. Auth, address, and order services use repositories and transactions; catalog data stays in the existing TypeScript seed. Docker Compose provides the local PostGIS instance, while API integration tests use a separate PostgreSQL database.

**Tech Stack:** NestJS 11, Fastify, TypeORM 0.3, PostgreSQL 17/PostGIS, Vitest, Docker Compose

---

## File Map

- `compose.yaml`: local PostGIS database and persistent volume.
- `infra/docker/init-databases.sql`: creates the isolated API test database on first container initialization.
- `.env.example`: safe local environment template.
- `apps/api/src/database/database.config.ts`: validates `DATABASE_URL` and returns TypeORM options.
- `apps/api/src/database/typeorm.data-source.ts`: migration CLI data source.
- `apps/api/src/database/entities/*.entity.ts`: account, visitor session, address, and virtual order persistence models.
- `apps/api/src/database/migrations/1760000000000-CreatePersistenceTables.ts`: initial application migration.
- `apps/api/src/auth.service.ts`: persistent guest/account identity lifecycle.
- `apps/api/src/address.service.ts`: repository-backed address operations.
- `apps/api/src/order.service.ts`: repository-backed virtual orders.
- `apps/api/src/app.controller.ts`: awaits asynchronous service methods and performs transactional visitor merge.
- `apps/api/test/api.test.ts`: database-backed API behavior.
- `apps/api/test/database.test-utils.ts`: migration, cleanup, and test application lifecycle.
- `apps/api/package.json`: database and corrected test scripts.
- `README.md`: frontend-friendly database startup instructions.

### Task 1: Local PostGIS runtime and validated TypeORM configuration

**Files:**
- Create: `compose.yaml`
- Create: `infra/docker/init-databases.sql`
- Create: `.env.example`
- Create: `apps/api/test/database.config.test.ts`
- Create: `apps/api/src/database/database.config.ts`
- Create: `apps/api/src/database/typeorm.data-source.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Write the failing database configuration tests**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseOptions } from '../src/database/database.config';

describe('createDatabaseOptions', () => {
  const original = process.env.DATABASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  it('requires DATABASE_URL', () => {
    delete process.env.DATABASE_URL;
    expect(() => createDatabaseOptions()).toThrow('DATABASE_URL');
  });

  it('disables schema synchronization', () => {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/baichile';
    expect(createDatabaseOptions()).toMatchObject({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      synchronize: false,
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec vitest run apps/api/test/database.config.test.ts`

Expected: FAIL because `database.config.ts` does not exist.

- [ ] **Step 3: Add local PostgreSQL configuration**

Create `compose.yaml` with `postgis/postgis:17-3.5`, database `baichile`, user/password `postgres`, port `5432`, a health check using `pg_isready`, a named `baichile-postgres` volume, and a read-only mount from `infra/docker/init-databases.sql` to `/docker-entrypoint-initdb.d/01-test-database.sql`.

Create `infra/docker/init-databases.sql`:

```sql
CREATE DATABASE baichile_test;
```

Create `.env.example`:

```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/baichile
WECHAT_MINI_APP_ID=
WECHAT_MINI_APP_SECRET=
TENCENT_MAP_KEY=
```

Implement `createDatabaseOptions()` returning `PostgresConnectionOptions` with `url`, `synchronize: false`, the explicit entity list, and the migration list. Throw `new Error('缺少 DATABASE_URL，无法连接 PostgreSQL')` when the value is absent.

Export a CLI `DataSource` from `typeorm.data-source.ts`, and import `TypeOrmModule.forRoot(createDatabaseOptions())` in `AppModule`.

Add scripts:

```json
{
  "db:up": "docker compose up -d postgres",
  "db:down": "docker compose down",
  "db:migrate": "typeorm-ts-node-commonjs -d src/database/typeorm.data-source.ts migration:run",
  "db:revert": "typeorm-ts-node-commonjs -d src/database/typeorm.data-source.ts migration:revert",
  "test": "vitest run test"
}
```

- [ ] **Step 4: Run the configuration tests and typecheck**

Run: `pnpm exec vitest run apps/api/test/database.config.test.ts`

Expected: 2 tests pass.

Run: `pnpm --filter @baichile/api typecheck`

Expected: exit code 0.

- [ ] **Step 5: Commit the runtime configuration**

```bash
git add compose.yaml infra/docker/init-databases.sql .env.example apps/api/src/database apps/api/test/database.config.test.ts apps/api/src/app.module.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): configure PostgreSQL connection"
```

### Task 2: Persistence entities and migration

**Files:**
- Create: `apps/api/src/database/entities/account.entity.ts`
- Create: `apps/api/src/database/entities/visitor-session.entity.ts`
- Create: `apps/api/src/database/entities/address.entity.ts`
- Create: `apps/api/src/database/entities/virtual-order.entity.ts`
- Create: `apps/api/src/database/migrations/1760000000000-CreatePersistenceTables.ts`
- Create: `apps/api/test/migration.test.ts`

- [ ] **Step 1: Write the failing migration test**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { createTestDataSource } from './database.test-utils';

describe('persistence migration', () => {
  let db: DataSource;
  beforeAll(async () => {
    db = await createTestDataSource();
    await db.runMigrations();
  });
  afterAll(async () => db.destroy());

  it('creates persistence tables', async () => {
    const rows = await db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [['accounts', 'visitor_sessions', 'addresses', 'virtual_orders']],
    );
    expect(rows.map((row: { table_name: string }) => row.table_name).sort()).toEqual(
      ['accounts', 'addresses', 'virtual_orders', 'visitor_sessions'],
    );
  });
});
```

- [ ] **Step 2: Start the test database and verify RED**

Run: `docker compose up -d postgres`

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/baichile_test pnpm exec vitest run apps/api/test/migration.test.ts`

Expected: FAIL because the entity, helper, and migration files do not exist.

- [ ] **Step 3: Implement explicit entities**

Define:

- `AccountEntity`: text `id` using the public `account_*` identifier, unique nullable `wechatOpenIdHash`, nullable `nickname` and `avatarUrl`, `createdAt`.
- `VisitorSessionEntity`: UUID `id`, unique `visitorId`, nullable indexed `accountId`, `createdAt`.
- `AddressEntity`: text UUID-style `id`, nullable indexed `visitorId`/`accountId`, all `Address` fields, `createdAt`, `updatedAt`.
- `VirtualOrderEntity`: UUID `id`, nullable indexed `visitorId`/`accountId`, status and timing columns, quote totals, destination ID, `lines` JSONB, and `route` JSONB.

Use snake_case table and column names so the migration and entities match exactly.

- [ ] **Step 4: Implement the migration**

In `up()`:

- enable `postgis`;
- create `accounts`, `visitor_sessions`, `addresses`, and `virtual_orders`;
- add unique constraints for OpenID hash and visitor ID;
- add indexes on address/order ownership;
- add non-negative checks for monetary columns.

In `down()`, drop the four tables in reverse dependency order. Do not drop the shared PostGIS extension.

- [ ] **Step 5: Run migration test and typecheck**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/baichile_test pnpm exec vitest run apps/api/test/migration.test.ts`

Expected: 1 test passes.

Run: `pnpm --filter @baichile/api typecheck`

Expected: exit code 0.

- [ ] **Step 6: Commit entities and migration**

```bash
git add apps/api/src/database apps/api/test/migration.test.ts apps/api/test/database.test-utils.ts
git commit -m "feat(api): add persistence schema"
```

### Task 3: Persistent guest and account identities

**Files:**
- Create: `apps/api/test/auth.service.test.ts`
- Modify: `apps/api/src/auth.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/app.controller.ts`

- [ ] **Step 1: Write failing identity tests**

Test with TypeORM repositories from the test database:

```ts
it('persists a guest session', async () => {
  const session = await service.createGuest();
  const row = await visitors.findOneByOrFail({ visitorId: session.visitorId });
  expect(row.accountId).toBeNull();
});

it('returns the same account for repeated WeChat OpenID', async () => {
  mockWechatSession('openid-1');
  const first = await service.loginWechatMini(validLogin);
  const second = await service.loginWechatMini(validLogin);
  expect(second.accountId).toBe(first.accountId);
});
```

- [ ] **Step 2: Verify RED**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/baichile_test pnpm exec vitest run apps/api/test/auth.service.test.ts`

Expected: FAIL because `AuthService` does not inject repositories and `createGuest()` is not asynchronous.

- [ ] **Step 3: Persist identities**

Inject `Repository<AccountEntity>` and `Repository<VisitorSessionEntity>`.

- `createGuest()` creates both the returned token data and a visitor session row.
- real WeChat login hashes OpenID, finds or creates an account, and returns a deterministic signed-subject-compatible account token.
- development login creates a persisted account.
- `resolveIdentity()` remains synchronous and parses the existing token contract.
- add `linkVisitorToAccount(visitorId, accountId, manager)` for transactional merge.

Change controller auth methods to `async` and `await`.

- [ ] **Step 4: Verify GREEN**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/baichile_test pnpm exec vitest run apps/api/test/auth.service.test.ts`

Expected: identity tests pass.

- [ ] **Step 5: Commit identity persistence**

```bash
git add apps/api/src/auth.service.ts apps/api/test/auth.service.test.ts apps/api/src/app.module.ts apps/api/src/app.controller.ts
git commit -m "feat(api): persist guest and account identities"
```

### Task 4: Persistent addresses and transactional ownership

**Files:**
- Create: `apps/api/test/address.service.test.ts`
- Modify: `apps/api/src/address.service.ts`
- Modify: `apps/api/src/app.controller.ts`

- [ ] **Step 1: Write failing address tests**

```ts
it('keeps one default address per identity', async () => {
  const first = await service.save(address({ isDefault: true }), { visitorId: 'visitor_a' });
  const second = await service.save(address({ isDefault: true }), { visitorId: 'visitor_a' });
  const result = await service.list({ visitorId: 'visitor_a' });
  expect(result.find((item) => item.id === first.id)?.isDefault).toBe(false);
  expect(result.find((item) => item.id === second.id)?.isDefault).toBe(true);
});

it('moves guest addresses to an account', async () => {
  await service.save(address(), { visitorId: 'visitor_a' });
  await service.merge('visitor_a', 'account_a');
  expect(await service.list({ visitorId: 'visitor_a' })).toEqual([]);
  expect(await service.list({ accountId: 'account_a' })).toHaveLength(1);
});
```

- [ ] **Step 2: Verify RED**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/baichile_test pnpm exec vitest run apps/api/test/address.service.test.ts`

Expected: FAIL because the service still stores data in a `Map`.

- [ ] **Step 3: Replace the map with a repository**

Implement `list`, `save`, `remove`, and `merge` as async repository operations. Use a transaction in `save` when changing defaults. Query ownership with an explicit account-or-visitor condition and never accept ownership from the request body.

- [ ] **Step 4: Verify GREEN**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/baichile_test pnpm exec vitest run apps/api/test/address.service.test.ts`

Expected: address tests pass.

- [ ] **Step 5: Commit address persistence**

```bash
git add apps/api/src/address.service.ts apps/api/test/address.service.test.ts apps/api/src/app.controller.ts
git commit -m "feat(api): persist delivery addresses"
```

### Task 5: Persistent virtual orders and atomic visitor merge

**Files:**
- Create: `apps/api/test/order.service.test.ts`
- Create: `apps/api/src/identity-merge.service.ts`
- Create: `apps/api/test/identity-merge.service.test.ts`
- Modify: `apps/api/src/order.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/app.controller.ts`

- [ ] **Step 1: Write failing order persistence test**

```ts
it('reads an order through a new service instance', async () => {
  const created = await service.create(validQuoteRequest, 'visitor_a');
  const reloaded = new OrderService(catalog, ordersRepository);
  await expect(reloaded.find(created.id)).resolves.toMatchObject({
    id: created.id,
    visitorId: 'visitor_a',
    totalCents: created.totalCents,
  });
});
```

- [ ] **Step 2: Verify order test RED**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/baichile_test pnpm exec vitest run apps/api/test/order.service.test.ts`

Expected: FAIL because orders are held in an instance `Map`.

- [ ] **Step 3: Persist virtual orders**

Keep `quote()` synchronous. Make `create`, `find`, `list`, and `merge` asynchronous. Store quote lines and route as JSONB and map the entity back to the existing `VirtualOrder` response without changing field names.

- [ ] **Step 4: Write failing atomic merge test**

```ts
it('moves visitor session, addresses, and orders in one transaction', async () => {
  await merge.merge('visitor_a', 'account_a');
  expect(await addresses.list({ accountId: 'account_a' })).toHaveLength(1);
  expect(await orders.list(undefined, 'account_a')).toHaveLength(1);
  expect((await visitors.findOneByOrFail({ visitorId: 'visitor_a' })).accountId).toBe('account_a');
});
```

- [ ] **Step 5: Implement the merge coordinator**

`IdentityMergeService` injects `DataSource`, `AuthService`, `AddressService`, and `OrderService`. Its `merge(visitorId, accountId)` opens one `dataSource.transaction` and passes the transaction manager into all three merge operations. The WeChat controller calls this coordinator after successful login.

- [ ] **Step 6: Verify order and merge tests GREEN**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/baichile_test pnpm exec vitest run apps/api/test/order.service.test.ts apps/api/test/identity-merge.service.test.ts`

Expected: all focused tests pass.

- [ ] **Step 7: Commit order persistence**

```bash
git add apps/api/src/order.service.ts apps/api/test/order.service.test.ts apps/api/src/identity-merge.service.ts apps/api/test/identity-merge.service.test.ts apps/api/src/app.module.ts apps/api/src/app.controller.ts
git commit -m "feat(api): persist orders and merge guest data"
```

### Task 6: API integration, developer instructions, and light verification

**Files:**
- Create: `apps/api/test/database.test-utils.ts`
- Modify: `apps/api/test/api.test.ts`
- Modify: `apps/api/package.json`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Adapt API tests to the test database**

Before the suite, initialize a test data source, run migrations, compile `AppModule`, and clear only the four application tables. After the suite, close NestJS and the data source. Add a restart assertion by closing and recreating the Nest application before reading a saved address and order.

- [ ] **Step 2: Run the API suite**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/baichile_test pnpm --filter @baichile/api test`

Expected: the API tests pass from the package directory, proving the corrected script works.

- [ ] **Step 3: Add root database scripts and setup documentation**

Add root scripts:

```json
{
  "db:up": "docker compose up -d postgres",
  "db:down": "docker compose down",
  "db:migrate": "pnpm --filter @baichile/api db:migrate"
}
```

Document this exact first-run sequence:

```bash
cp .env.example apps/api/.env
pnpm db:up
pnpm db:migrate
pnpm dev:api
```

Also document `pnpm db:down` and state that Docker Desktop must be running.

- [ ] **Step 4: Perform light final verification**

Run:

```bash
pnpm --filter @baichile/api typecheck
pnpm --filter @baichile/api build
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/baichile_test pnpm --filter @baichile/api test
```

Expected: typecheck and build exit 0; all API tests pass. Do not run the entire monorepo or any visual comparison.

- [ ] **Step 5: Commit documentation and integration**

```bash
git add apps/api/test apps/api/package.json package.json README.md
git commit -m "docs: add local database workflow"
```
