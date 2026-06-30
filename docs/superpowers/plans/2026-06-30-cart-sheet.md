# Cart Detail Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users open the cart summary on the store page and see the dishes currently in their cart.

**Architecture:** Add a focused presentational `CartSheet` component that receives visibility and cart lines and emits only `close`. The store page owns visibility and guards opening against empty or cross-store carts; Pinia remains the single source of cart data.

**Tech Stack:** Vue 3, uni-app, TypeScript, Pinia, Vitest

---

### Task 1: Cart detail component

**Files:**
- Create: `apps/client/src/components/CartSheet.vue`
- Create: `apps/client/src/components/CartSheet.test.ts`

- [x] **Step 1: Write the failing component test**

Create a source-level component test, matching the existing `SkuSheet.test.ts` convention, that requires conditional visibility, cart-line rendering, specification names, quantity, line total, backdrop close, and stopped inner taps.

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm test apps/client/src/components/CartSheet.test.ts`

Expected: FAIL because `CartSheet.vue` does not exist.

- [x] **Step 3: Implement the minimal component**

Create `CartSheet.vue` with `visible` and `lines` props, a `close` emit, a backdrop, and a bottom sheet. Render each line's `item.name`, `optionNames`, `quantity`, and formatted `totalCents`.

- [x] **Step 4: Run the component test**

Run: `pnpm test apps/client/src/components/CartSheet.test.ts`

Expected: PASS.

### Task 2: Store-page interaction

**Files:**
- Modify: `apps/client/src/pages/store/index.vue`
- Create: `apps/client/src/pages/store/index.test.ts`

- [x] **Step 1: Write the failing page interaction test**

Require an `isCartOpen` state, an `openCart` guard using `canCheckout`, a tap binding on the cart summary only, and a `CartSheet` wired to `cart.lines` and `close`.

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm test apps/client/src/pages/store/index.test.ts`

Expected: FAIL because the page has no cart-sheet interaction.

- [x] **Step 3: Wire the component into the page**

Import `CartSheet`, add `isCartOpen` and guarded `openCart`, bind the cart summary tap, and render the sheet with `:visible`, `:lines`, and `@close`. Leave the checkout button's existing tap behavior unchanged.

- [x] **Step 4: Run focused verification**

Run: `pnpm test apps/client/src/components/CartSheet.test.ts apps/client/src/pages/store/index.test.ts`

Expected: both test files PASS.

- [x] **Step 5: Run client type checking**

Run: `pnpm --filter @baichile/client typecheck`

Expected: exit code 0.

- [ ] **Step 6: Commit implementation**

Commit only the component, tests, page integration, and this plan with message `fix: show current dishes from cart bar`.
