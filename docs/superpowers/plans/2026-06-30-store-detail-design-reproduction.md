# Store Detail Design Reproduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce the supplied merchant-detail design in the existing uni-app store page without changing its business behavior.

**Architecture:** Keep the implementation in `pages/store/index.vue`: computed view adapters group existing menu data while the template and scoped styles reproduce the reference layout. Existing catalog loading, SKU selection, cart drawer, and checkout handlers remain the sole owners of behavior.

**Tech Stack:** Vue 3 Composition API, uni-app components, TypeScript, scoped CSS, Vitest.

---

### Task 1: Add structural regression coverage

**Files:**
- Modify: `apps/client/src/pages/store/index.test.ts`

- [ ] **Step 1: Write the failing test**

Add a source-level test asserting that the page contains the design structure and view adapters:

```ts
it('renders the complete merchant design structure around existing behavior', () => {
  const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

  expect(source).toContain('const menuGroups = computed');
  expect(source).toContain('class="merchant-hero"');
  expect(source).toContain('class="service-strip"');
  expect(source).toContain('class="menu-layout"');
  expect(source).toContain('class="category-sidebar"');
  expect(source).toContain('class="product-card"');
  expect(source).toContain('item.specGroups.length ? \\'选规格\\' : \\'＋\\'');
  expect(source).toContain('@tap="goBack"');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run apps/client/src/pages/store/index.test.ts`

Expected: the new test fails because `menuGroups` and the new design classes do not exist.

- [ ] **Step 3: Leave the test ready for implementation**

Do not weaken the assertions after observing the expected failure.

### Task 2: Implement view adapters and reference structure

**Files:**
- Modify: `apps/client/src/pages/store/index.vue`

- [ ] **Step 1: Add presentation-only computed data**

Add a category label map, `menuGroups`, store initial, fee labels, and a `goBack` handler. Group items by their existing `categoryId`; do not mutate `store.menu` or introduce API changes.

- [ ] **Step 2: Replace the template structure**

Build the following hierarchy with uni-app elements:

```text
store-page
├── merchant-hero
│   ├── hero-nav
│   ├── merchant-content
│   ├── merchant-meta
│   └── notice-row
├── service-strip
├── menu-layout
│   ├── category-sidebar
│   └── menu-content
│       └── menu-section > product-card
├── cart-bar
├── SkuSheet
└── CartSheet
```

Preserve `selected = item`, `openCart`, `@tap.stop="checkout"`, all sheet props/events, and the current add handler.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run: `pnpm vitest run apps/client/src/pages/store/index.test.ts`

Expected: both store-page tests pass.

### Task 3: Reproduce the visual system

**Files:**
- Modify: `apps/client/src/pages/store/index.vue`

- [ ] **Step 1: Add scoped page and hero styles**

Implement the reference palette, rounded dark-green hero, lime accents, merchant logo, metadata, notice row, safe-area spacing, and compact service strip using `rpx`.

- [ ] **Step 2: Add menu and product styles**

Implement the two-column menu, muted category rail, active first category, grouped section headers, compact product cards, image/fallback visuals, price hierarchy, and lime add/spec buttons.

- [ ] **Step 3: Restyle the existing cart bar**

Implement the fixed dark pill with cart icon, count, total, checkout button, disabled state, and `env(safe-area-inset-bottom)` positioning without changing click handlers.

- [ ] **Step 4: Add narrow-screen safeguards**

Use a scoped media query to reduce the sidebar and product image widths, clamp product descriptions, and prevent text overflow.

### Task 4: Lightweight verification and commit

**Files:**
- Verify: `apps/client/src/pages/store/index.vue`
- Verify: `apps/client/src/pages/store/index.test.ts`

- [ ] **Step 1: Run the focused regression test**

Run: `pnpm vitest run apps/client/src/pages/store/index.test.ts`

Expected: 2 tests pass with 0 failures.

- [ ] **Step 2: Run client type checking**

Run: `pnpm --filter @baichile/client typecheck`

Expected: command exits with code 0.

- [ ] **Step 3: Check the patch**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only the plan, page, and page test are changed.

- [ ] **Step 4: Commit the implementation**

```bash
git add docs/superpowers/plans/2026-06-30-store-detail-design-reproduction.md \
  apps/client/src/pages/store/index.vue \
  apps/client/src/pages/store/index.test.ts
git commit -m "feat: reproduce store detail design"
```
