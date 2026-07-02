# Catalog and Analytics Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all remaining server-owned catalog and analytics data into PostgreSQL while preserving the mini-program API contract.

**Architecture:** TypeORM entities model categories, stores, store subcategories, menu items, and analytics events. A transactional, idempotent seed command imports the existing TypeScript catalog; `CatalogService` reconstructs current API responses from repositories, and `AnalyticsService` validates and persists events.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL 17, Vitest, pnpm

---

### Task 1: Add catalog and analytics schema

**Files:**
- Create: `apps/api/src/database/entities/category.entity.ts`
- Create: `apps/api/src/database/entities/store.entity.ts`
- Create: `apps/api/src/database/entities/store-sub-category.entity.ts`
- Create: `apps/api/src/database/entities/menu-item.entity.ts`
- Create: `apps/api/src/database/entities/analytics-event.entity.ts`
- Create: `apps/api/src/database/migrations/1760000001000-CreateCatalogAndAnalyticsTables.ts`
- Modify: `apps/api/src/database/database.config.ts`
- Modify: `apps/api/test/migration.test.ts`

- [ ] Add a failing migration assertion for `categories`, `stores`, `store_sub_categories`, `menu_items`, and `analytics_events`.
- [ ] Run `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/baichile_test pnpm exec vitest run apps/api/test/migration.test.ts` and verify the new assertion fails because the tables do not exist.
- [ ] Implement entities with stable text IDs, foreign keys, monetary checks, ordering columns, `text[]` tags, and JSONB specification groups.
- [ ] Implement migration `1760000001000` with reversible table creation and ownership indexes for analytics.
- [ ] Register entities and migration in `database.config.ts`.
- [ ] Re-run the focused migration test and expect it to pass.

### Task 2: Add idempotent transactional catalog seeding

**Files:**
- Create: `apps/api/src/database/catalog.seed-runner.ts`
- Create: `apps/api/src/database/seed.ts`
- Create: `apps/api/test/catalog-seed.test.ts`
- Modify: `apps/api/package.json`
- Modify: `package.json`

- [ ] Write a failing test that runs the seed twice and expects category, store, and menu-item counts to remain unchanged after the second run.
- [ ] Verify RED against the test database.
- [ ] Implement `seedCatalog(dataSource)` as one transaction, upserting categories, stores, subcategories, and menu items in dependency order without deleting non-seed rows.
- [ ] Add CLI `seed.ts` that initializes the configured data source, runs the seed, reports counts, and always destroys the connection.
- [ ] Add API script `"db:seed": "ts-node src/database/seed.ts"` and root script `"db:seed": "pnpm --filter @baichile/api db:seed"`.
- [ ] Re-run the seed test and expect it to pass.

### Task 3: Read catalog exclusively from PostgreSQL

**Files:**
- Create: `apps/api/test/catalog.service.test.ts`
- Modify: `apps/api/src/catalog.service.ts`
- Modify: `apps/api/src/order.service.ts`
- Modify: `apps/api/src/app.controller.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] Write failing tests proving `home`, category filtering, menu-item search, and store detail are returned after seeding and remain available without importing seed arrays in the service.
- [ ] Verify RED because `CatalogService` still reads `catalog.seed.ts`.
- [ ] Inject the four catalog repositories and implement async `home`, `list`, and `find`.
- [ ] Reconstruct `StoreDetail` with sorted subcategories and menu items, preserving all current field names and optional values.
- [ ] Make catalog controller methods and `OrderService.quote`/callers asynchronous where database lookup requires it.
- [ ] Register catalog entities with `TypeOrmModule.forFeature`.
- [ ] Run focused catalog and API tests and expect them to pass.

### Task 4: Persist analytics events

**Files:**
- Create: `apps/api/src/analytics.service.ts`
- Create: `apps/api/test/analytics.service.test.ts`
- Modify: `apps/api/src/app.controller.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] Write a failing API test posting `{ "eventName": "home_view", "payload": { "source": "launch" } }`, expecting 201 and one matching database row.
- [ ] Add a failing test expecting 400 when `eventName` is absent or blank.
- [ ] Verify RED because the current endpoint only echoes the body.
- [ ] Implement `AnalyticsService.record(body, identity)` with trimmed event-name validation and JSONB payload persistence.
- [ ] Resolve the authenticated identity in the controller before recording the event.
- [ ] Run focused analytics and API tests and expect them to pass.

### Task 5: Migrate real data and document the workflow

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-01-catalog-analytics-persistence-design.md` only if implementation reveals a factual discrepancy

- [ ] Run `pnpm db:migrate` against the local `baichile` database.
- [ ] Run `pnpm db:seed` twice and verify reported/table counts do not increase on the second run.
- [ ] Query PostgreSQL counts and compare them with the seed arrays.
- [ ] Update README first-run commands to include `pnpm db:seed`.
- [ ] Restart the current API process.
- [ ] Verify `/v1/catalog/home`, `/v1/catalog/search`, and `/v1/analytics/events` against the live API.

### Task 6: Light final verification

**Files:**
- Modify: none unless verification exposes a defect

- [ ] Run `pnpm --filter @baichile/api typecheck`.
- [ ] Run `pnpm --filter @baichile/api build`.
- [ ] Run `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/baichile_test pnpm --filter @baichile/api test`.
- [ ] Run `docker compose ps` and confirm PostgreSQL is healthy.
- [ ] Do not run the full monorepo, deep tests, or visual comparisons.
