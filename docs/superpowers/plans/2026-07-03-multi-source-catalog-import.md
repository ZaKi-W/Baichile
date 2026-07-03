# Multi-Source Chinese Catalog Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter, deduplicate, translate, and import the Uber Eats, Talabat, and ChowNow catalogs into the existing PostgreSQL-backed catalog.

**Architecture:** Generalize the existing ChowNow catalog builder into a source-aware pure transformation module. Generate translations into a durable JSON cache before opening a database transaction, then atomically refresh imported (`derived`) catalog records while preserving manually managed records.

**Tech Stack:** TypeScript, Node.js `fetch`/filesystem APIs, NestJS/TypeORM, PostgreSQL, Vitest.

---

### Task 1: Generalize filtering and deduplication

**Files:**
- Modify: `apps/api/src/database/catalog.chownow-import.ts`
- Modify: `apps/api/test/catalog-chownow-import.test.ts`

- [ ] Add failing tests proving that stores without covers or valid local menu images are removed, duplicate stores use normalized original names, and duplicate items use normalized original name plus price in cents.
- [ ] Run `pnpm exec vitest run apps/api/test/catalog-chownow-import.test.ts` and confirm the new assertions fail.
- [ ] Introduce source-aware input records, stable source-prefixed IDs, normalization helpers, completeness ranking, and deterministic store/item deduplication.
- [ ] Apply translations only after deduplication through an injected translation lookup.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Add durable translation cache generation

**Files:**
- Create: `apps/api/src/scripts/catalog-translations.ts`
- Create: `apps/api/test/catalog-translations.test.ts`
- Create: `apps/api/data/catalog-translations.json`

- [ ] Add failing tests for stable cache keys, official merchant-name overrides, unchanged cache reuse, and fallback to original text when translation fails.
- [ ] Run `pnpm exec vitest run apps/api/test/catalog-translations.test.ts` and confirm failure.
- [ ] Implement JSON cache loading/saving and an injectable English-to-Simplified-Chinese translator.
- [ ] Add official merchant overrides such as `McDonald's` → `麦当劳`; preserve unknown brand names while translating recognizable location suffixes.
- [ ] Implement rate-limited translation requests with retry and incremental cache checkpoints so an interrupted run can resume.
- [ ] Re-run the focused test and confirm it passes.

### Task 3: Replace the single-source CLI with a multi-source preflight/import CLI

**Files:**
- Modify: `apps/api/src/scripts/import-chownow-catalog.ts`
- Modify: `apps/api/package.json`
- Modify: `package.json`

- [ ] Add a loader accepting `source=directory` arguments for all three source directories.
- [ ] Add `--translate` to populate the cache without opening the database and `--dry-run` to print per-source read, filtered, duplicate, translated, and final counts.
- [ ] Make normal import require complete cached translations, compare normalized merchant names against non-derived database records, and atomically replace only existing `derived` records.
- [ ] Rename scripts to `db:translate-catalog` and `db:import-catalog`, retaining the old script alias only if existing usage requires it.
- [ ] Run API typecheck and the two focused test files.

### Task 4: Generate translations and import

**Files:**
- Modify: `apps/api/data/catalog-translations.json`

- [ ] Run the translation command against all three supplied directories and let incremental checkpoints complete.
- [ ] Run preflight and inspect counts for missing images, duplicate stores, duplicate items, untranslated fallbacks, and final records.
- [ ] Run the transactional import against the configured local PostgreSQL database.
- [ ] Query post-import counts and sample records to confirm Chinese names and non-empty image URLs.

### Task 5: Synchronize client version and verify

**Files:**
- Modify: `apps/client/src/config/code-version.ts`

- [ ] Increment `CODE_VERSION` once from 15 to 16.
- [ ] Run only focused tests and typecheck; do not run deep tests.
- [ ] Confirm the development mini-program watcher rebuilds and `dist/dev/mp-weixin/config/code-version.js` contains 16.
- [ ] Review the final diff for unrelated changes and report exact import/filter/deduplication totals.
