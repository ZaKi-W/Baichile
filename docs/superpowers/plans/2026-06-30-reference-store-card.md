# Reference-Style Store Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the merchant card to match the supplied food-delivery reference hierarchy while keeping the existing text placeholder instead of introducing images.

**Architecture:** Add one structured `recentViewers` field to the shared store contract and deterministic seed data. Recompose the existing shared `StoreCard` into a large square placeholder plus four compact information rows, preserving all list consumers without changing their pages.

**Tech Stack:** TypeScript, Vue 3, uni-app, Vitest

---

### Task 1: Simulated recent-viewer metric

**Files:**
- Modify: `packages/api-contract/src/index.ts`
- Modify: `apps/client/src/mock/catalog.ts`
- Modify: `apps/api/src/catalog.seed.ts`
- Modify: `apps/client/src/mock/catalog.test.ts`

- [x] **Step 1: Add a failing Mock-data assertion**

Require every store to have a non-negative integer `recentViewers`, and require at least two distinct values.

- [x] **Step 2: Run and verify RED**

Run: `pnpm test apps/client/src/mock/catalog.test.ts`

Expected: FAIL because `recentViewers` is missing.

- [x] **Step 3: Add contract and deterministic values**

Add `recentViewers: number` to `StoreSummary`. Populate client and API Mock stores with `86 + (index * 127) % 900`.

- [x] **Step 4: Run and verify GREEN**

Run: `pnpm test apps/client/src/mock/catalog.test.ts`

Expected: PASS.

### Task 2: Reference-style card composition

**Files:**
- Modify: `apps/client/src/components/StoreCard.vue`
- Modify: `apps/client/src/components/StoreCard.test.ts`

- [x] **Step 1: Replace card assertions with the desired hierarchy**

Require `cover` before `info`, rows named `merchant-meta`, `fulfilment`, `reputation`, the text `最近24小时{{ store.recentViewers }}人看过`, a `180rpx` square cover, and single-line ellipsis on the name. Ensure rating is rendered in the reputation row rather than the heading.

- [x] **Step 2: Run and verify RED**

Run: `pnpm test apps/client/src/components/StoreCard.test.ts`

Expected: FAIL because the current card uses the earlier generic metric layout.

- [x] **Step 3: Implement the reference hierarchy**

Recompose `StoreCard.vue` into the approved five-part structure. Use restrained orange for reputation, green for one merchant tag, gray for logistics metadata, and keep the existing tags weak and compact.

- [x] **Step 4: Run focused verification**

Run: `pnpm test apps/client/src/mock/catalog.test.ts apps/client/src/components/StoreCard.test.ts`

Expected: both test files PASS.

- [x] **Step 5: Verify types and Mini Program output**

Run: `pnpm --filter @baichile/client typecheck && pnpm --filter @baichile/api typecheck && pnpm --filter @baichile/client build:mp-weixin`

Expected: exit code 0 and generated WXML containing the recent-viewer text.

- [ ] **Step 6: Commit**

Commit the contract, Mock data, component, tests, and plan with message `feat: match store cards to delivery list reference`.
