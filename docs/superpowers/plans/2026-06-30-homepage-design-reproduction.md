# Homepage Design Reproduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce the supplied homepage design in the uni-app client while preserving live catalog data and adding a functional Discover tab.

**Architecture:** Keep catalog fetching in the existing service layer, move view-specific sorting and decoration into focused client helpers, and render the supplied hierarchy with uni-app Vue components. Reuse a redesigned `StoreCard` across Home, Discover, and Category while keeping navigation and backend contracts unchanged.

**Tech Stack:** Vue 3, uni-app, TypeScript, Pinia, Vitest, scoped CSS/SCSS

---

## File Structure

- Modify `apps/client/src/pages/home/index.vue`: custom home header, carousel, category grid, recommendation controls, data states, and navigation.
- Modify `apps/client/src/pages/home/index.test.ts`: source-level regression tests for the required homepage sections and timer cleanup.
- Create `apps/client/src/pages/discover/index.vue`: Discover tab using existing catalog data.
- Create `apps/client/src/pages/discover/index.test.ts`: Discover page data and navigation regression tests.
- Modify `apps/client/src/components/StoreCard.vue`: compact reference-style merchant card with deterministic visual variants.
- Modify `apps/client/src/components/StoreCard.test.ts`: card field and styling regression tests.
- Modify `apps/client/src/custom-tab-bar/index.vue`: four-tab configuration and route-derived selection.
- Create `apps/client/src/custom-tab-bar/index.test.ts`: tab labels, routes, and selected-state regression tests.
- Modify `apps/client/src/pages.json`: register Discover, disable the native header on Home and Discover, and add the tab entry.
- Modify `packages/icon-registry/src/index.ts`: add the Discover icon used by the custom tab bar.

### Task 1: Register the Discover route and four-tab navigation

**Files:**
- Modify: `packages/icon-registry/src/index.ts`
- Modify: `apps/client/src/pages.json`
- Modify: `apps/client/src/custom-tab-bar/index.vue`
- Create: `apps/client/src/custom-tab-bar/index.test.ts`

- [ ] **Step 1: Write the failing navigation test**

Create a test that reads `pages.json` and `custom-tab-bar/index.vue`, then asserts:

```ts
expect(pages.pages).toContainEqual({
  path: 'pages/discover/index',
  style: { navigationStyle: 'custom' },
});
expect(pages.tabBar.list.map((item) => item.text)).toEqual(['首页', '发现', '订单', '我的']);
expect(tabbarSource).toContain("path: '/pages/discover/index'");
expect(tabbarSource).toContain("icon: 'discover'");
expect(tabbarSource).toContain('onShow(syncSelected)');
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run apps/client/src/custom-tab-bar/index.test.ts`

Expected: FAIL because Discover is not registered and selection is fixed at index zero.

- [ ] **Step 3: Implement route-aware four-tab navigation**

Add `discover` to `IconKey` and `ICON_REGISTRY`, add the Discover page and tab item to `pages.json`, and set `navigationStyle: "custom"` on Home and Discover. In the custom tab bar, define:

```ts
const items = [
  { path: '/pages/home/index', label: '首页', icon: 'home' },
  { path: '/pages/discover/index', label: '发现', icon: 'discover' },
  { path: '/pages/orders/index', label: '订单', icon: 'orders' },
  { path: '/pages/profile/index', label: '我的', icon: 'profile' },
] satisfies Array<{ path: string; label: string; icon: IconKey }>;

function syncSelected() {
  const route = `/${getCurrentPages().at(-1)?.route ?? ''}`;
  selected.value = Math.max(0, items.findIndex((item) => item.path === route));
}

onShow(syncSelected);
```

Rebuild the tab bar CSS as the supplied 66px-equivalent floating, translucent, rounded control with safe-area padding and a muted selected capsule.

- [ ] **Step 4: Run the navigation test**

Run: `pnpm vitest run apps/client/src/custom-tab-bar/index.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/icon-registry/src/index.ts apps/client/src/pages.json apps/client/src/custom-tab-bar/index.vue apps/client/src/custom-tab-bar/index.test.ts
git commit -m "feat: add discover tab navigation"
```

### Task 2: Redesign the shared store card

**Files:**
- Modify: `apps/client/src/components/StoreCard.vue`
- Modify: `apps/client/src/components/StoreCard.test.ts`

- [ ] **Step 1: Write failing card structure tests**

Assert the component contains the live fields and reference classes:

```ts
expect(source).toContain('store.rating.toFixed(1)');
expect(source).toContain('store.minimumOrderCents');
expect(source).toContain('store.deliveryFeeCents');
expect(source).toContain('store.distanceKm');
expect(source).toContain('store.virtualDeliveryMinutes');
expect(source).toContain('store.monthlySales');
expect(source).toContain('class="merchant-avatar"');
expect(source).toContain('class="score"');
expect(source).toContain('class="tag-row"');
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm vitest run apps/client/src/components/StoreCard.test.ts`

Expected: FAIL because the current structure uses the old `cover`, `reputation`, and `tags` classes.

- [ ] **Step 3: Implement the compact reference card**

Keep `store: StoreSummary` as the public prop and add an optional `index?: number` prop. Format money and delivery fee from existing fields, derive the avatar from the category/name with a deterministic emoji lookup, and render:

```vue
<view class="store-card" :class="`tone-${index % 5}`" @tap="$emit('open')">
  <view class="merchant-avatar"><text>{{ avatar }}</text></view>
  <view class="store-body">
    <view class="store-topline">
      <text class="store-name">{{ store.name }}</text>
      <text class="score">★ {{ store.rating.toFixed(1) }}</text>
    </view>
    <view class="store-meta">
      <text>¥{{ money(store.minimumOrderCents) }}起送</text>
      <text>{{ deliveryFee(store.deliveryFeeCents) }}</text>
      <text>📍 {{ distance(store.distanceKm) }}</text>
      <text>🕒 {{ store.virtualDeliveryMinutes }}分钟</text>
    </view>
    <view class="tag-row">
      <text v-for="tag in visibleTags" :key="tag" class="store-tag">{{ tag }}</text>
      <text class="store-tag muted">月售{{ store.monthlySales }}</text>
    </view>
  </view>
</view>
```

Match the supplied spacing, 22px-equivalent radius, subtle inset border/shadow, 76px-equivalent avatar, typography, tag colors, active scale, and five-color decorative variants using `rpx`.

- [ ] **Step 4: Run component tests**

Run: `pnpm vitest run apps/client/src/components/StoreCard.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/components/StoreCard.vue apps/client/src/components/StoreCard.test.ts
git commit -m "feat: match store cards to homepage design"
```

### Task 3: Rebuild the Home page

**Files:**
- Modify: `apps/client/src/pages/home/index.vue`
- Modify: `apps/client/src/pages/home/index.test.ts`

- [ ] **Step 1: Write failing homepage regression tests**

Add assertions for:

```ts
expect(source).toContain('class="topbar"');
expect(source).toContain('class="search-wrap"');
expect(source).toContain('class="hero"');
expect(source).toContain('class="category-grid"');
expect(source).toContain('class="filter-row"');
expect(source).toContain('class="route-note"');
expect(source).toContain('onUnload(stopCarousel)');
expect(source).toContain('data.categories.slice(0, 8)');
expect(source).toContain(':index="index"');
```

Retain the existing assertion that the removed “今晚想吃什么” card does not return.

- [ ] **Step 2: Run the homepage test and verify it fails**

Run: `pnpm vitest run apps/client/src/pages/home/index.test.ts`

Expected: FAIL because the supplied hierarchy and carousel cleanup are absent.

- [ ] **Step 3: Implement state, sorting, and navigation**

Keep `catalogService.home()` and `useLocationStore()`. Add:

```ts
const activeSlide = ref(0);
const activeFilter = ref('综合排序');
const filters = ['综合排序', '距离最近', '评分最高', '预计更快', '免配送费'];
const sortedStores = computed(() => {
  const stores = [...(data.value?.stores ?? [])];
  if (activeFilter.value === '距离最近') return stores.sort((a, b) => a.distanceKm - b.distanceKm);
  if (activeFilter.value === '评分最高') return stores.sort((a, b) => b.rating - a.rating);
  if (activeFilter.value === '预计更快') return stores.sort((a, b) => a.virtualDeliveryMinutes - b.virtualDeliveryMinutes);
  if (activeFilter.value === '免配送费') return stores.sort((a, b) => Number(a.deliveryFeeCents > 0) - Number(b.deliveryFeeCents > 0));
  return stores;
});
```

Use `onShow` to start a 4.8-second carousel and `onHide`/`onUnload` to clear it. Keep buttons wired to existing category, store, search, profile, and location actions; route the discovery Hero to `/pages/discover/index`.

- [ ] **Step 4: Implement the supplied visual hierarchy**

Translate the reference HTML to uni-app elements using the exact page palette, spacing, radii, font weights, Hero dimensions, category color sequence, horizontal filter chips, recommendation badge, route note, safe-area top padding, and bottom tab clearance. Render actual interface categories and `sortedStores`; render styled loading/error/empty states inside their natural sections.

- [ ] **Step 5: Run the focused homepage and card tests**

Run: `pnpm vitest run apps/client/src/pages/home/index.test.ts apps/client/src/components/StoreCard.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/pages/home/index.vue apps/client/src/pages/home/index.test.ts
git commit -m "feat: reproduce supplied homepage design"
```

### Task 4: Build the Discover page from existing catalog data

**Files:**
- Create: `apps/client/src/pages/discover/index.vue`
- Create: `apps/client/src/pages/discover/index.test.ts`

- [ ] **Step 1: Write the failing Discover page test**

Assert:

```ts
expect(source).toContain('catalogService.home()');
expect(source).toContain('发现好味道');
expect(source).toContain('data.featured');
expect(source).toContain('data.categories');
expect(source).toContain('<StoreCard');
expect(source).toContain('class="safe-top"');
```

- [ ] **Step 2: Run the Discover test and verify it fails**

Run: `pnpm vitest run apps/client/src/pages/discover/index.test.ts`

Expected: FAIL because the file does not exist.

- [ ] **Step 3: Implement the Discover tab**

Fetch `HomeResponse` through `catalogService.home()`. Render a custom safe-area header, horizontally scrollable category topics, and `data.featured.length ? data.featured : data.stores.slice(0, 5)` through the redesigned `StoreCard`. Include matching loading, error/retry, and empty states, and navigate categories/stores through existing routes.

- [ ] **Step 4: Run Discover and navigation tests**

Run: `pnpm vitest run apps/client/src/pages/discover/index.test.ts apps/client/src/custom-tab-bar/index.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/pages/discover/index.vue apps/client/src/pages/discover/index.test.ts
git commit -m "feat: add catalog discovery page"
```

### Task 5: Lightweight integration verification

**Files:**
- Modify only files required by failures found in the commands below.

- [ ] **Step 1: Run the related client tests**

Run:

```bash
pnpm vitest run \
  apps/client/src/pages/home/index.test.ts \
  apps/client/src/pages/discover/index.test.ts \
  apps/client/src/components/StoreCard.test.ts \
  apps/client/src/custom-tab-bar/index.test.ts
```

Expected: all related test files PASS.

- [ ] **Step 2: Run client type checking**

Run: `pnpm --filter @baichile/client typecheck`

Expected: exit code 0.

- [ ] **Step 3: Run one target build**

Run: `pnpm --filter @baichile/client build:mp-weixin`

Expected: build completes with exit code 0.

- [ ] **Step 4: Review the final diff**

Run:

```bash
git status --short
git diff --check
git diff HEAD~4 --stat
```

Expected: no whitespace errors; only scoped homepage, Discover, store-card, icon, route, tab-bar, and test changes are present.

- [ ] **Step 5: Commit any verification fixes**

If verification required code changes:

```bash
git add <only-the-files-fixed-during-verification>
git commit -m "fix: complete homepage design integration"
```

If no fixes were needed, do not create an empty commit.
