# WeChat Mini Program Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional real WeChat mini-program login and show the logged-in user's chosen avatar and nickname.

**Architecture:** Shared API-contract types define the login payload and session. The NestJS auth service exchanges a mini-program code for an `openid` when credentials exist and uses a non-production mock fallback otherwise. The Pinia auth store owns login/session persistence and the profile page uses WeChat-native avatar and nickname controls.

**Tech Stack:** uni-app, Vue 3, Pinia, NestJS/Fastify, TypeScript, Vitest

---

## File Structure

- Modify `packages/api-contract/src/index.ts`: shared profile and login request/response types.
- Modify `apps/api/src/auth.service.ts`: WeChat code exchange, deterministic account ID, safe development fallback.
- Modify `apps/api/src/app.controller.ts`: typed login endpoint and visitor-order merge.
- Modify `apps/api/test/api.test.ts`: API-level login behavior tests.
- Create `apps/client/src/stores/auth.test.ts`: auth-store login and persistence tests.
- Modify `apps/client/src/stores/auth.ts`: restored session, real mini-program login, profile persistence.
- Create `apps/client/src/pages/profile/index.test.ts`: profile form and logged-in display checks.
- Modify `apps/client/src/pages/profile/index.vue`: avatar/nickname collection and logged-in presentation.

### Task 1: Define the Login Contract

**Files:**
- Modify: `packages/api-contract/src/index.ts`

- [ ] **Step 1: Add the shared types**

```ts
export interface UserProfile {
  avatarUrl: string;
  nickname: string;
}

export interface WechatMiniLoginRequest {
  code: string;
  visitorId?: string;
  profile: UserProfile;
}

export interface AccountSession {
  accountId: string;
  accessToken: string;
  provider: 'wechat' | 'dev-mock';
  profile: UserProfile;
}
```

- [ ] **Step 2: Run contract type checking**

Run: `pnpm --filter @baichile/api typecheck`
Expected: PASS with no TypeScript errors.

### Task 2: Implement the Server Login Exchange

**Files:**
- Modify: `apps/api/test/api.test.ts`
- Modify: `apps/api/src/auth.service.ts`
- Modify: `apps/api/src/app.controller.ts`

- [ ] **Step 1: Write failing API tests**

Add a test that posts `{ code, visitorId, profile }` to `/v1/auth/wechat-mini` without credentials in test mode and expects `provider: "dev-mock"`, the same profile, an `account_` ID, an account token, and no `openid` or `session_key`. Add a production-mode service test expecting missing credentials to reject.

- [ ] **Step 2: Run the focused API test and verify RED**

Run: `pnpm vitest run apps/api/test/api.test.ts`
Expected: FAIL because the current endpoint ignores the login payload and returns no profile/token.

- [ ] **Step 3: Implement minimal server behavior**

Add an injectable fetch dependency through a constructor default, validate profile strings, exchange the code at `https://api.weixin.qq.com/sns/jscode2session`, derive `accountId` from a SHA-256 digest of `openid`, and return only `AccountSession`. When credentials are absent, return `dev-mock` outside production and throw a configuration error in production. Update the controller to pass the typed body and merge the visitor's orders after successful authentication.

- [ ] **Step 4: Run the focused API test and verify GREEN**

Run: `pnpm vitest run apps/api/test/api.test.ts`
Expected: PASS.

### Task 3: Implement Client Session and Login

**Files:**
- Create: `apps/client/src/stores/auth.test.ts`
- Modify: `apps/client/src/stores/auth.ts`

- [ ] **Step 1: Write failing store tests**

Test `wechatLogin(profile)` with stubbed `uni.login`, `uni.request`, storage APIs and `import.meta.env`: verify the code, visitor ID and profile are posted, the returned session updates store state, and the session is persisted. Add a failure test verifying visitor state remains intact.

- [ ] **Step 2: Run the focused store test and verify RED**

Run: `pnpm vitest run apps/client/src/stores/auth.test.ts`
Expected: FAIL because `wechatLogin` and `userProfile` do not exist.

- [ ] **Step 3: Implement minimal client behavior**

Add `AccountSession`/`UserProfile` state, a `baichile:account` storage key, session restoration in `ensureGuest`, a promise wrapper around `uni.login`, a typed request wrapper, `wechatLogin(profile)`, `persistAccount()`, and `setUserProfile(profile)`. Keep `devLogin()` as a compatibility wrapper only for non-WeChat targets if existing callers require it.

- [ ] **Step 4: Run the focused store test and verify GREEN**

Run: `pnpm vitest run apps/client/src/stores/auth.test.ts`
Expected: PASS.

### Task 4: Build the Profile Login UI

**Files:**
- Create: `apps/client/src/pages/profile/index.test.ts`
- Modify: `apps/client/src/pages/profile/index.vue`

- [ ] **Step 1: Write failing page tests**

Read the SFC source and assert it contains `open-type="chooseAvatar"`, `type="nickname"`, validation for both fields, a loading guard, `auth.wechatLogin`, and logged-in bindings for `auth.userProfile.avatarUrl` and `auth.userProfile.nickname`.

- [ ] **Step 2: Run the focused page test and verify RED**

Run: `pnpm vitest run apps/client/src/pages/profile/index.test.ts`
Expected: FAIL because the profile page still exposes only development mock login.

- [ ] **Step 3: Implement the minimal profile page**

Use refs for avatar URL, nickname and loading. Handle `chooseavatar`, validate trimmed nickname/avatar before login, call `auth.wechatLogin`, and display a profile card with avatar and nickname after login. Preserve the recent-order count and product disclaimer.

- [ ] **Step 4: Run the focused page test and verify GREEN**

Run: `pnpm vitest run apps/client/src/pages/profile/index.test.ts`
Expected: PASS.

### Task 5: Lightweight Verification

**Files:**
- Modify only if verification exposes an issue in the changed files.

- [ ] **Step 1: Run related tests**

Run: `pnpm vitest run apps/api/test/api.test.ts apps/client/src/stores/auth.test.ts apps/client/src/pages/profile/index.test.ts`
Expected: PASS.

- [ ] **Step 2: Run type checks**

Run: `pnpm --filter @baichile/api typecheck && pnpm --filter @baichile/client typecheck`
Expected: PASS.

- [ ] **Step 3: Build the WeChat mini program**

Run: `pnpm build:mp-weixin`
Expected: build completes successfully.

- [ ] **Step 4: Review the diff**

Run: `git diff --check && git status --short`
Expected: no whitespace errors; only intended login files plus the user's pre-existing changes are present.

