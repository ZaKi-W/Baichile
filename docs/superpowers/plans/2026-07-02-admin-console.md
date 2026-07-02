# 白吃了后台管理端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Monorepo 中交付一个具备管理员登录、三级 RBAC、审计日志，以及商家、菜品、用户、钱包和订单管理能力的内部 Web 后台。

**Architecture:** 新增 `apps/admin` Vue SPA，通过 `/v1/admin` 调用现有 NestJS 模块化单体；后台使用独立的不透明会话和路由级权限。业务数据继续存放于现有 PostgreSQL，钱包调整使用事务和不可变流水，敏感写操作写入审计日志。

**Tech Stack:** Vue 3、Vite、TypeScript、Vue Router、Pinia、Element Plus、NestJS、TypeORM、PostgreSQL、Vitest

---

## 文件结构

### API

- `apps/api/src/admin/admin.types.ts`：固定角色、权限和分页类型。
- `apps/api/src/admin/admin-auth.service.ts`：密码哈希、登录、会话解析和密码修改。
- `apps/api/src/admin/admin-auth.guard.ts`：解析后台 Bearer token。
- `apps/api/src/admin/admin-permission.guard.ts`：校验 permission metadata。
- `apps/api/src/admin/admin-permission.decorator.ts`：声明路由权限。
- `apps/api/src/admin/admin-audit.service.ts`：净化并写入审计日志。
- `apps/api/src/admin/admin-query.service.ts`：仪表盘和各资源查询。
- `apps/api/src/admin/admin-mutation.service.ts`：商家、菜品、用户、钱包、订单和管理员写操作。
- `apps/api/src/admin/admin.controller.ts`：后台 HTTP API。
- `apps/api/src/admin/admin.module.ts`：后台模块装配。
- `apps/api/src/database/entities/admin-*.entity.ts`：管理员、会话、审计实体。
- `apps/api/src/database/migrations/1760000005000-AddAdminConsole.ts`：后台表和业务状态字段。
- `apps/api/test/admin-*.test.ts`：鉴权、权限、查询与关键事务的定向测试。

### Admin SPA

- `apps/admin/package.json`、`vite.config.ts`、`tsconfig.json`、`index.html`：应用脚手架。
- `apps/admin/src/api/*`：请求客户端和按模块 API。
- `apps/admin/src/stores/auth.ts`：后台会话和当前管理员。
- `apps/admin/src/router.ts`：路由、权限 metadata 和导航守卫。
- `apps/admin/src/layouts/AdminLayout.vue`：后台外壳。
- `apps/admin/src/components/*`：分页、状态、金额和通用表单组件。
- `apps/admin/src/pages/*`：登录、仪表盘、商家、菜品、用户、钱包、订单、管理员和审计页面。
- `apps/admin/src/styles.css`：后台全局样式变量和布局。
- `apps/admin/src/*.test.ts`：请求与权限的轻量单元测试。

### 共享与小程序

- `packages/api-contract/src/admin.ts`：后台请求、响应和权限 contract。
- `packages/api-contract/src/index.ts`：导出后台 contract。
- `apps/api/src/catalog.service.ts`：小程序只返回上架商家和菜品。
- `apps/api/src/auth.service.ts`：拒绝被禁用用户。
- `apps/client/src/config/code-version.ts`：整个实现完成后只自增一次。

## Task 1：建立后台 contract 与数据模型

**Files:**
- Create: `packages/api-contract/src/admin.ts`
- Modify: `packages/api-contract/src/index.ts`
- Create: `apps/api/src/database/entities/admin-user.entity.ts`
- Create: `apps/api/src/database/entities/admin-session.entity.ts`
- Create: `apps/api/src/database/entities/admin-audit-log.entity.ts`
- Create: `apps/api/src/database/migrations/1760000005000-AddAdminConsole.ts`
- Modify: `apps/api/src/database/entities/account.entity.ts`
- Modify: `apps/api/src/database/entities/store.entity.ts`
- Modify: `apps/api/src/database/entities/menu-item.entity.ts`
- Modify: `apps/api/src/database/entities/virtual-order.entity.ts`
- Test: `apps/api/test/admin-database.test.ts`

- [ ] **Step 1: 写失败的实体与 migration 测试**

验证 `admin_users`、`admin_sessions`、`admin_audit_logs` 被 TypeORM 注册，并检查现有四张表新增状态字段：

```ts
expect(dataSource.getMetadata(AdminUserEntity).tableName).toBe('admin_users');
expect(dataSource.getMetadata(StoreEntity).findColumnWithPropertyName('status')).toBeDefined();
expect(dataSource.getMetadata(MenuItemEntity).findColumnWithPropertyName('status')).toBeDefined();
expect(dataSource.getMetadata(AccountEntity).findColumnWithPropertyName('status')).toBeDefined();
expect(dataSource.getMetadata(VirtualOrderEntity).findColumnWithPropertyName('adminStatus')).toBeDefined();
```

- [ ] **Step 2: 运行定向测试并确认失败**

Run: `pnpm vitest run apps/api/test/admin-database.test.ts`

Expected: FAIL，提示后台实体或字段不存在。

- [ ] **Step 3: 定义 contract、实体和 migration**

核心 contract：

```ts
export type AdminRole = 'super_admin' | 'operator' | 'support';
export type AdminPermission =
  | 'dashboard:read' | 'catalog:read' | 'catalog:write'
  | 'accounts:read' | 'accounts:write' | 'wallet:read' | 'wallet:adjust'
  | 'orders:read' | 'orders:write' | 'admins:manage' | 'audit:read';

export interface AdminPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
```

新字段默认值：

```ts
@Column({ type: 'text', default: 'active' }) status!: 'active' | 'inactive';
@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
```

订单管理状态使用：

```ts
@Column({ name: 'admin_status', type: 'text', default: 'normal' })
adminStatus!: 'normal' | 'following_up' | 'resolved';
@Column({ name: 'admin_note', type: 'text', default: '' }) adminNote!: string;
```

- [ ] **Step 4: 注册实体并运行测试**

Run: `pnpm vitest run apps/api/test/admin-database.test.ts apps/api/test/migration.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/api-contract apps/api/src/database apps/api/src/app.module.ts apps/api/test/admin-database.test.ts
git commit -m "feat: add admin console data model"
```

## Task 2：实现管理员鉴权与固定 RBAC

**Files:**
- Create: `apps/api/src/admin/admin.types.ts`
- Create: `apps/api/src/admin/admin-auth.service.ts`
- Create: `apps/api/src/admin/admin-auth.guard.ts`
- Create: `apps/api/src/admin/admin-permission.decorator.ts`
- Create: `apps/api/src/admin/admin-permission.guard.ts`
- Test: `apps/api/test/admin-auth.test.ts`

- [ ] **Step 1: 写登录、会话和权限失败测试**

覆盖正确密码登录、错误密码、禁用管理员、过期会话和角色权限：

```ts
expect(ROLE_PERMISSIONS.super_admin).toContain('wallet:adjust');
expect(ROLE_PERMISSIONS.operator).not.toContain('wallet:adjust');
expect(ROLE_PERMISSIONS.support).toContain('orders:write');
expect(ROLE_PERMISSIONS.support).not.toContain('catalog:write');
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm vitest run apps/api/test/admin-auth.test.ts`

Expected: FAIL，提示鉴权服务和权限映射不存在。

- [ ] **Step 3: 实现密码、token 和权限**

使用 Node `crypto.scrypt` 和 `timingSafeEqual`：

```ts
const salt = randomBytes(16).toString('hex');
const digest = await scryptAsync(password, salt, 64) as Buffer;
return `scrypt:${salt}:${digest.toString('hex')}`;
```

会话 token 使用 `randomBytes(32).toString('base64url')`，数据库只保存
`createHash('sha256').update(token).digest('hex')`。默认过期时间为 8 小时。

固定角色映射：

```ts
export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  super_admin: ALL_ADMIN_PERMISSIONS,
  operator: ['dashboard:read', 'catalog:read', 'catalog:write', 'accounts:read',
    'wallet:read', 'orders:read', 'orders:write'],
  support: ['dashboard:read', 'catalog:read', 'accounts:read', 'accounts:write',
    'wallet:read', 'orders:read', 'orders:write'],
};
```

- [ ] **Step 4: 运行测试**

Run: `pnpm vitest run apps/api/test/admin-auth.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/admin apps/api/test/admin-auth.test.ts
git commit -m "feat: add admin authentication and rbac"
```

## Task 3：实现审计、管理员管理和初始化账号

**Files:**
- Create: `apps/api/src/admin/admin-audit.service.ts`
- Create: `apps/api/src/admin/admin-bootstrap.service.ts`
- Create: `apps/api/test/admin-audit.test.ts`
- Modify: `apps/api/src/admin/admin-auth.service.ts`

- [ ] **Step 1: 写审计净化和超级管理员初始化测试**

```ts
expect(sanitizeAuditData({ password: 'x', token: 'y', name: '店铺' }))
  .toEqual({ password: '[REDACTED]', token: '[REDACTED]', name: '店铺' });
```

验证仅在 `ADMIN_BOOTSTRAP_USERNAME` 与 `ADMIN_BOOTSTRAP_PASSWORD` 同时存在且数据库无管理员时创建超级管理员。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm vitest run apps/api/test/admin-audit.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现审计服务和启动初始化**

审计 action 使用稳定字符串，例如：

```ts
await audit.record(admin, {
  action: 'wallet.adjust',
  resourceType: 'account',
  resourceId: accountId,
  beforeData: { balanceCents },
  afterData: { balanceCents: nextBalance, amountCents, reason },
});
```

初始化密码不足 10 位时拒绝启动创建，不在日志输出密码。

- [ ] **Step 4: 运行测试**

Run: `pnpm vitest run apps/api/test/admin-audit.test.ts apps/api/test/admin-auth.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/admin apps/api/test/admin-audit.test.ts
git commit -m "feat: add admin audit and bootstrap"
```

## Task 4：实现后台查询 API

**Files:**
- Create: `apps/api/src/admin/admin-query.service.ts`
- Create: `apps/api/src/admin/admin.controller.ts`
- Create: `apps/api/src/admin/admin.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/admin-query.test.ts`

- [ ] **Step 1: 写分页、筛选和仪表盘测试**

验证页码边界、模糊查询、状态筛选与总数：

```ts
expect(await query.normalizePage({ page: 0, pageSize: 500 }))
  .toEqual({ page: 1, pageSize: 100, skip: 0 });
```

仪表盘断言必须覆盖商家、菜品、用户、订单和钱包五类指标。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm vitest run apps/api/test/admin-query.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现查询和只读路由**

实现：

```text
GET /v1/admin/dashboard
GET /v1/admin/stores
GET /v1/admin/stores/:id
GET /v1/admin/menu-items
GET /v1/admin/menu-items/:id
GET /v1/admin/accounts
GET /v1/admin/accounts/:id
GET /v1/admin/accounts/:id/wallet
GET /v1/admin/orders
GET /v1/admin/orders/:id
GET /v1/admin/admin-users
GET /v1/admin/audit-logs
```

每个路由声明精确 permission；列表统一返回 `AdminPage<T>`。

- [ ] **Step 4: 运行测试**

Run: `pnpm vitest run apps/api/test/admin-query.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/admin apps/api/src/app.module.ts apps/api/test/admin-query.test.ts
git commit -m "feat: add admin query api"
```

## Task 5：实现目录、用户和订单写操作

**Files:**
- Create: `apps/api/src/admin/admin-mutation.service.ts`
- Modify: `apps/api/src/admin/admin.controller.ts`
- Test: `apps/api/test/admin-mutation.test.ts`

- [ ] **Step 1: 写权限、校验、状态与审计失败测试**

覆盖：

```ts
await expect(service.updateStore('missing', input, actor)).rejects.toMatchObject({ status: 404 });
await expect(service.updateAccount(accountId, { status: 'unknown' }, actor)).rejects.toBeDefined();
await expect(service.updateOrder(orderId, { totalCents: 1 } as never, actor)).rejects.toBeDefined();
```

并断言每个成功写操作产生对应审计记录。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm vitest run apps/api/test/admin-mutation.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 DTO 和写操作**

实现：

```text
POST/PATCH /v1/admin/stores
POST/PATCH /v1/admin/menu-items
PATCH /v1/admin/accounts/:id
PATCH /v1/admin/orders/:id
POST/PATCH /v1/admin/admin-users
POST /v1/admin/admin-users/:id/reset-password
```

商家与菜品不提供物理删除。订单 DTO 只接受：

```ts
interface UpdateAdminOrder {
  adminStatus?: 'normal' | 'following_up' | 'resolved';
  adminNote?: string;
}
```

- [ ] **Step 4: 运行测试**

Run: `pnpm vitest run apps/api/test/admin-mutation.test.ts apps/api/test/admin-query.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/admin apps/api/test/admin-mutation.test.ts
git commit -m "feat: add admin resource mutations"
```

## Task 6：实现钱包事务调整

**Files:**
- Modify: `packages/api-contract/src/index.ts`
- Modify: `apps/api/src/database/entities/wallet-transaction.entity.ts`
- Modify: `apps/api/src/admin/admin-mutation.service.ts`
- Modify: `apps/api/src/admin/admin.controller.ts`
- Test: `apps/api/test/admin-wallet.test.ts`

- [ ] **Step 1: 写增加、扣减、余额不足与原子性测试**

```ts
await service.adjustWallet(accountId, { amountCents: 500, reason: '活动补偿' }, actor);
expect(account.balanceCents).toBe(500);
expect(transaction.type).toBe('admin_adjustment');

await expect(service.adjustWallet(accountId, {
  amountCents: -501, reason: '错误回收',
}, actor)).rejects.toMatchObject({ status: 409 });
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm vitest run apps/api/test/admin-wallet.test.ts`

Expected: FAIL。

- [ ] **Step 3: 使用 TypeORM transaction 和悲观锁实现**

在单个事务中：

```ts
const account = await manager.getRepository(AccountEntity).findOne({
  where: { id: accountId },
  lock: { mode: 'pessimistic_write' },
});
const nextBalance = account.balanceCents + amountCents;
if (nextBalance < 0) throw new ConflictException({ code: 'INSUFFICIENT_BALANCE' });
```

随后更新余额、插入 `admin_adjustment` 流水和审计日志。原因 trim 后长度必须为 2–200。

- [ ] **Step 4: 运行测试**

Run: `pnpm vitest run apps/api/test/admin-wallet.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/api-contract apps/api/src apps/api/test/admin-wallet.test.ts
git commit -m "feat: add audited wallet adjustments"
```

## Task 7：保护小程序目录和禁用用户

**Files:**
- Modify: `apps/api/src/catalog.service.ts`
- Modify: `apps/api/src/auth.service.ts`
- Test: `apps/api/test/admin-client-protection.test.ts`

- [ ] **Step 1: 写下架过滤和禁用账号测试**

验证下架商家、下架菜品不进入小程序 catalog；禁用账号的 token 解析返回 401。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm vitest run apps/api/test/admin-client-protection.test.ts`

Expected: FAIL。

- [ ] **Step 3: 将状态条件加入现有查询**

目录查询添加：

```ts
where: { status: 'active' }
```

读取商家详情时同时过滤其菜品状态。账号解析后增加：

```ts
if (account.status === 'disabled') {
  throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: '账号已被禁用' });
}
```

- [ ] **Step 4: 运行定向回归**

Run: `pnpm vitest run apps/api/test/admin-client-protection.test.ts apps/api/test/catalog-seed.test.ts apps/api/test/api.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/catalog.service.ts apps/api/src/auth.service.ts apps/api/test/admin-client-protection.test.ts
git commit -m "feat: enforce managed catalog and account status"
```

## Task 8：建立 Admin SPA、登录与权限外壳

**Files:**
- Create: `apps/admin/package.json`
- Create: `apps/admin/tsconfig.json`
- Create: `apps/admin/vite.config.ts`
- Create: `apps/admin/index.html`
- Create: `apps/admin/src/main.ts`
- Create: `apps/admin/src/App.vue`
- Create: `apps/admin/src/api/http.ts`
- Create: `apps/admin/src/api/auth.ts`
- Create: `apps/admin/src/stores/auth.ts`
- Create: `apps/admin/src/router.ts`
- Create: `apps/admin/src/layouts/AdminLayout.vue`
- Create: `apps/admin/src/pages/LoginPage.vue`
- Create: `apps/admin/src/styles.css`
- Test: `apps/admin/src/auth.test.ts`

- [ ] **Step 1: 写 token、401 和 permission 测试**

```ts
expect(canAccess(['catalog:read'], 'catalog:read')).toBe(true);
expect(canAccess(['catalog:read'], 'wallet:adjust')).toBe(false);
```

请求返回 401 时断言清理 sessionStorage 并触发未登录回调。

- [ ] **Step 2: 安装依赖并确认测试失败**

Run: `pnpm install && pnpm --filter @baichile/admin test`

Expected: FAIL，提示实现不存在。

- [ ] **Step 3: 实现应用外壳**

`package.json` scripts：

```json
{
  "dev": "vite",
  "build": "vue-tsc --noEmit && vite build",
  "test": "vitest run",
  "typecheck": "vue-tsc --noEmit"
}
```

路由守卫先确保已加载 `/auth/me`，再根据 `meta.permission` 判定；无权限跳转到首页。侧栏菜单使用同一权限函数过滤。

- [ ] **Step 4: 运行测试和构建**

Run: `pnpm --filter @baichile/admin test && pnpm --filter @baichile/admin build`

Expected: PASS，Vite 生成 `apps/admin/dist`。

- [ ] **Step 5: 提交**

```bash
git add apps/admin pnpm-lock.yaml
git commit -m "feat: scaffold admin console shell"
```

## Task 9：实现仪表盘、商家和菜品页面

**Files:**
- Create: `apps/admin/src/api/catalog.ts`
- Create: `apps/admin/src/api/dashboard.ts`
- Create: `apps/admin/src/pages/DashboardPage.vue`
- Create: `apps/admin/src/pages/StoresPage.vue`
- Create: `apps/admin/src/pages/StoreEditorPage.vue`
- Create: `apps/admin/src/pages/MenuItemsPage.vue`
- Create: `apps/admin/src/pages/MenuItemEditorPage.vue`
- Create: `apps/admin/src/components/PageHeader.vue`
- Create: `apps/admin/src/components/PaginationBar.vue`
- Test: `apps/admin/src/catalog.test.ts`

- [ ] **Step 1: 写筛选序列化和金额转换测试**

```ts
expect(yuanToCents('12.34')).toBe(1234);
expect(centsToYuan(1234)).toBe('12.34');
expect(toQuery({ page: 1, keyword: '', status: 'active' })).toBe('page=1&status=active');
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @baichile/admin test -- catalog.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现页面**

仪表盘使用五组指标卡和订单状态列表。商家、菜品列表使用服务端分页；编辑页使用 Element Plus Form。规格组输入在提交前执行：

```ts
const specGroups = JSON.parse(specGroupsText);
if (!Array.isArray(specGroups)) throw new Error('规格组必须是数组');
```

所有上下架和离页丢失修改操作显示确认框。

- [ ] **Step 4: 运行测试和构建**

Run: `pnpm --filter @baichile/admin test && pnpm --filter @baichile/admin build`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/admin/src
git commit -m "feat: add admin dashboard and catalog pages"
```

## Task 10：实现用户、钱包和订单页面

**Files:**
- Create: `apps/admin/src/api/accounts.ts`
- Create: `apps/admin/src/api/orders.ts`
- Create: `apps/admin/src/pages/AccountsPage.vue`
- Create: `apps/admin/src/pages/AccountDetailPage.vue`
- Create: `apps/admin/src/pages/WalletPage.vue`
- Create: `apps/admin/src/pages/OrdersPage.vue`
- Create: `apps/admin/src/pages/OrderDetailPage.vue`
- Create: `apps/admin/src/components/WalletAdjustmentDialog.vue`
- Test: `apps/admin/src/accounts.test.ts`

- [ ] **Step 1: 写余额调整和订单 DTO 测试**

```ts
expect(buildAdjustment('10.00', '活动补偿')).toEqual({
  amountCents: 1000,
  reason: '活动补偿',
});
expect(buildOrderPatch('resolved', '已联系用户')).toEqual({
  adminStatus: 'resolved',
  adminNote: '已联系用户',
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @baichile/admin test -- accounts.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现页面与敏感操作确认**

用户详情只允许编辑昵称、状态。钱包页展示余额和不可变流水；只有 `wallet:adjust` 权限显示调整按钮，提交弹窗再次显示金额、调整后余额和原因。订单详情只编辑 `adminStatus` 与 `adminNote`，商品和金额均只读。

- [ ] **Step 4: 运行测试和构建**

Run: `pnpm --filter @baichile/admin test && pnpm --filter @baichile/admin build`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/admin/src
git commit -m "feat: add account wallet and order management"
```

## Task 11：实现管理员和审计页面

**Files:**
- Create: `apps/admin/src/api/admin-users.ts`
- Create: `apps/admin/src/api/audit.ts`
- Create: `apps/admin/src/pages/AdminUsersPage.vue`
- Create: `apps/admin/src/pages/AuditLogsPage.vue`
- Test: `apps/admin/src/admin-users.test.ts`

- [ ] **Step 1: 写管理员输入校验测试**

```ts
expect(validateAdminInput({ username: 'op_1', password: '1234567890' })).toEqual([]);
expect(validateAdminInput({ username: 'x', password: '123' })).toContain('密码至少 10 位');
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @baichile/admin test -- admin-users.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现超级管理员专属页面**

管理员页面支持新增、角色修改、禁用和密码重置。当前登录管理员不能禁用自己。审计页支持按管理员、action、resource type 和时间筛选；before/after JSON 使用折叠详情展示。

- [ ] **Step 4: 运行测试和构建**

Run: `pnpm --filter @baichile/admin test && pnpm --filter @baichile/admin build`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/admin/src
git commit -m "feat: add admin user and audit pages"
```

## Task 12：版本号、轻量验证和运行文档

**Files:**
- Modify: `apps/client/src/config/code-version.ts`
- Modify: `README.md`

- [ ] **Step 1: 记录运行配置**

README 增加：

```text
ADMIN_BOOTSTRAP_USERNAME
ADMIN_BOOTSTRAP_PASSWORD
ADMIN_ALLOWED_ORIGIN
VITE_API_BASE_URL
```

以及：

```bash
pnpm db:migrate
pnpm --filter @baichile/api dev
pnpm --filter @baichile/admin dev
pnpm build:mp-weixin
```

- [ ] **Step 2: 自增一次小程序代码版本**

将 `apps/client/src/config/code-version.ts` 中 `CODE_VERSION` 当前整数加 1。整个后台实现无论修改多少文件只执行这一次。

- [ ] **Step 3: 执行轻量验证**

Run:

```bash
pnpm --filter @baichile/api typecheck
pnpm --filter @baichile/admin test
pnpm --filter @baichile/admin build
pnpm vitest run apps/api/test/admin-database.test.ts apps/api/test/admin-auth.test.ts apps/api/test/admin-audit.test.ts apps/api/test/admin-query.test.ts apps/api/test/admin-mutation.test.ts apps/api/test/admin-wallet.test.ts apps/api/test/admin-client-protection.test.ts
pnpm build:mp-weixin
git diff --check
```

Expected: 全部退出码为 0；不执行全量深度测试或视觉化对比。

- [ ] **Step 4: 审计目标覆盖**

逐项确认当前代码存在并被验证：

```text
后台基本功能：登录、退出、会话、密码、布局、分页、错误反馈
基础 RBAC：super_admin / operator / support
商家管理：查询、新增、编辑、上下架
菜品管理：查询、新增、编辑、上下架
用户信息：查询、详情、昵称与状态
用户货币：余额、流水、审计化调整
用户订单：查询、详情、管理状态与内部备注
安全与追踪：后台独立 API、服务端权限、审计日志
小程序优先：微信小程序构建成功、目录状态过滤、账号禁用保护
```

- [ ] **Step 5: 提交**

```bash
git add README.md apps/client/src/config/code-version.ts
git commit -m "docs: add admin console runbook"
```
