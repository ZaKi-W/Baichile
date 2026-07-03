# Address Location and WeChat Phone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make address positioning and place search report accurate results and add user-authorized WeChat phone-number retrieval.

**Architecture:** The mini program keeps using its own API as the only proxy for Tencent and WeChat secrets. Small testable helpers normalize API errors and location state, while `AuthService` exchanges the one-time phone code on the server.

**Tech Stack:** uni-app/Vue 3, WeChat mini-program APIs, NestJS, TypeScript, Vitest.

---

### Task 1: Preserve map-service errors

**Files:**
- Modify: `apps/client/src/services/location.ts`
- Test: `apps/client/src/services/location.test.ts`

- [ ] Add a failing test in which `uni.request` returns HTTP 502 with `{ message: '此key每日调用量已达到上限' }` and assert that `suggestPlaces()` rejects with that message.
- [ ] Run `pnpm vitest run apps/client/src/services/location.test.ts` and confirm the assertion fails with the generic “请求失败”.
- [ ] Update the location request helper to extract the response body's `message`, translate the quota response to `地图服务今日额度已用完，请稍后再试`, and retain `网络连接失败` for transport errors.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Correct address-form location behavior

**Files:**
- Create: `apps/client/src/pages/address-form/location-state.ts`
- Test: `apps/client/src/pages/address-form/location-state.test.ts`
- Modify: `apps/client/src/pages/address-form/index.vue`

- [ ] Add failing tests proving a successful GPS result becomes the selected coordinates and a reverse-geocoded area becomes a readable address.
- [ ] Run the focused test and confirm the helper does not exist yet.
- [ ] Implement a helper returning `{ lat, lng, address }`, where address joins province, city, and district without duplicating direct-administered municipality names.
- [ ] Use it in `locateMe`: update selected coordinates immediately, call `reverseGeocode`, fill `addressText`, then load nearby places without converting map-service failures into GPS failures.
- [ ] Show precise map-service failures for nearby/search operations and pass the current city to `suggestPlaces`.
- [ ] Re-run the focused tests.

### Task 3: Exchange WeChat phone codes on the backend

**Files:**
- Modify: `packages/api-contract/src/index.ts`
- Modify: `apps/api/src/auth.service.ts`
- Modify: `apps/api/src/app.controller.ts`
- Test: `apps/api/test/wechat-phone.test.ts`

- [ ] Add failing service tests that mock two WeChat requests: stable access-token acquisition and `phonenumber/getuserphonenumber`, then assert the returned phone number.
- [ ] Add failing tests for missing code and WeChat error responses.
- [ ] Run `pnpm vitest run apps/api/test/wechat-phone.test.ts` and confirm the new method is missing.
- [ ] Add `WechatPhoneRequest` and `WechatPhoneResult` contracts.
- [ ] Implement `AuthService.getWechatPhoneNumber(code)` with input validation, app credential validation, WeChat response validation, and short-lived in-process access-token caching.
- [ ] Expose `POST /v1/auth/wechat-phone`.
- [ ] Re-run the focused tests.

### Task 4: Add the phone authorization control

**Files:**
- Create: `apps/client/src/services/wechat-phone.ts`
- Test: `apps/client/src/services/wechat-phone.test.ts`
- Modify: `apps/client/src/pages/address-form/index.vue`

- [ ] Add a failing client-service test asserting the temporary code is posted to `/v1/auth/wechat-phone` and its phone number is returned.
- [ ] Run the focused test and confirm the service is absent.
- [ ] Implement the client service through the shared `requestApi` helper.
- [ ] Add a WeChat-only `open-type="getPhoneNumber"` button beside the phone input; handle consent, fill the input on success, and leave manual entry available on refusal/failure.
- [ ] Re-run the focused test.

### Task 5: Version and lightweight verification

**Files:**
- Modify: `apps/client/src/config/code-version.ts`

- [ ] Increment `CODE_VERSION` from 16 to 17 exactly once.
- [ ] Run the four focused Vitest files.
- [ ] Run `pnpm --filter @baichile/client typecheck` and `pnpm --filter @baichile/api typecheck`.
- [ ] Inspect `git diff --check` and confirm no unrelated user changes were altered.
