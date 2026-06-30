# Store Card Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the virtual-store description in merchant cards with realistic simulated sales, rating, distance, delivery-time, minimum-order, and delivery-fee information.

**Architecture:** Extend the shared store contract with structured metric fields and populate both API and client seed data deterministically. Keep presentation and formatting inside `StoreCard.vue`, so homepage, category, and search lists receive the change through their existing shared component.

**Tech Stack:** TypeScript, Vue 3, uni-app, Vitest

---

### Task 1: Store metric contract and simulated data

**Files:**
- Modify: `packages/api-contract/src/index.ts`
- Modify: `apps/client/src/mock/catalog.ts`
- Modify: `apps/api/src/catalog.seed.ts`
- Create: `apps/client/src/mock/catalog.test.ts`

- [x] **Step 1: Write a failing Mock-data test**

Create `catalog.test.ts` that checks every client Mock store has non-negative integer `monthlySales`, non-negative `distanceKm`, and a `rating` between 0 and 5, and verifies stores do not all receive the same values.

- [x] **Step 2: Run the test and verify RED**

Run: `pnpm test apps/client/src/mock/catalog.test.ts`

Expected: FAIL because the three fields do not exist.

- [x] **Step 3: Add shared fields and deterministic values**

Add `monthlySales`, `distanceKm`, and `rating` to `StoreSummary`. Populate client and API stores using stable formulas based on store index; set some delivery fees to zero so both fee labels are represented.

- [x] **Step 4: Run the Mock-data test**

Run: `pnpm test apps/client/src/mock/catalog.test.ts`

Expected: PASS.

### Task 2: Store-card information hierarchy

**Files:**
- Modify: `apps/client/src/components/StoreCard.vue`
- Create: `apps/client/src/components/StoreCard.test.ts`

- [x] **Step 1: Write a failing card test**

Create a source-level component test, following the repository convention, that requires rating, monthly sales, one-decimal distance, delivery minutes, compact minimum-order formatting, paid/free delivery labels, and absence of `store.description`.

- [x] **Step 2: Run the test and verify RED**

Run: `pnpm test apps/client/src/components/StoreCard.test.ts`

Expected: FAIL because the card still renders the description and old delivery copy.

- [x] **Step 3: Implement the card layout and formatters**

Add compact money formatting and delivery-fee formatting. Render name and rating in the header row, operations metrics in the second row, fulfilment pricing in the third row, and keep tags as the final row.

- [x] **Step 4: Run focused verification**

Run: `pnpm test apps/client/src/mock/catalog.test.ts apps/client/src/components/StoreCard.test.ts`

Expected: both test files PASS.

- [x] **Step 5: Run type checking**

Run: `pnpm --filter @baichile/client typecheck && pnpm --filter @baichile/api typecheck`

Expected: exit code 0.

- [ ] **Step 6: Commit**

Commit the contract, seed data, component, tests, and this plan with message `feat: enrich store cards with delivery metrics`.
