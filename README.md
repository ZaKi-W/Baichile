# 白吃了

外卖平台风格的虚拟消费 MVP。订单只扣除账号内虚拟余额，不涉及真钱支付，也不会真实发货；地图路线与骑手位置均为虚拟演示。

## 当前架构

- 客户端：uni-app Vue 3，当前以微信小程序为优先目标。
- 后端：腾讯云开发 CloudBase `api` 云函数，统一承载 `/v1/*` 与 `/v1/admin/*`。
- 数据库：腾讯云开发文档数据库 collections。
- 目录源数据：`@baichile/catalog-data`，通过 `cloudbase:seed` 同步到云开发库。
- 共享契约：`@baichile/api-contract` 继续作为小程序、后台和云函数之间的类型契约。

项目不再使用本地 NestJS API、Docker Compose 或 PostgreSQL 作为开发/运行链路。

## 本地运行

需要 Node.js 20+ 与 pnpm 11+。

```bash
pnpm install
pnpm dev
```

`pnpm dev` 只启动微信小程序增量编译。首次在微信开发者工具中导入：

```text
apps/client/dist/dev/mp-weixin
```

日常保存代码后保持 `pnpm dev` 运行即可自动同步。发布构建使用：

```bash
pnpm build:mp-weixin
```

发布构建输出目录是：

```text
apps/client/dist/build/mp-weixin
```

## CloudBase 配置

小程序默认通过 `wx.cloud.callFunction` 调用云函数，不再回退到本地 HTTP API。

`apps/client/.env` 至少需要：

```bash
VITE_CLOUDBASE_ENV_ID=cloud1-d8g7o18ula3c12f10
VITE_CLOUDBASE_API_FUNCTION=api
```

云函数运行环境需要：

```bash
CLOUDBASE_ENV_ID=cloud1-d8g7o18ula3c12f10
WECHAT_MINI_APP_ID=...
WECHAT_MINI_APP_SECRET=...
TENCENT_MAP_KEY=...
ADMIN_BOOTSTRAP_USERNAME=...
ADMIN_BOOTSTRAP_PASSWORD=...
ADMIN_BOOTSTRAP_DISPLAY_NAME=...
```

## 数据维护

店铺、分类和菜单的本地源数据位于 `packages/catalog-data`。改完店铺名或菜单后，同步到腾讯云开发库：

```bash
CLOUDBASE_ENV_ID=cloud1-d8g7o18ula3c12f10 pnpm cloudbase:seed
CLOUDBASE_ENV_ID=cloud1-d8g7o18ula3c12f10 pnpm cloudbase:verify
pnpm build:mp-weixin
```

如需导入历史迁移 JSON：

```bash
CLOUDBASE_ENV_ID=cloud1-d8g7o18ula3c12f10 pnpm cloudbase:import
```

图片迁移到云存储/CDN 后，更新 CloudBase catalog 图片 URL：

```bash
CLOUDBASE_ENV_ID=cloud1-d8g7o18ula3c12f10 \
CATALOG_IMAGE_BASE_URL=https://example.com/choutuan-img \
pnpm catalog-images:migrate
```

## 云函数部署

```bash
pnpm cloudbase:build
pnpm cloudbase:prepare-deploy
```

`apps/cloud-functions/cloudbaserc.json` 定义了 `api` 云函数和后台静态站点部署配置。实际部署前确认 CloudBase CLI/MCP 已登录到目标环境。

## 内部运营后台

后台是仓库内独立的 Vue Web 应用，接口统一走 `/v1/admin` 云函数路由。开发命令：

```bash
pnpm dev:admin
```

默认访问 `http://localhost:5174`。本地调后台时需要配置能访问 `api` 云函数的 HTTP 网关地址：

```bash
VITE_CLOUDBASE_HTTP_API_URL=https://your-cloudbase-function-gateway
```

开发环境初始账号由云函数启动时保证：

```bash
账号：admin
密码：admin
```

生产环境首次启动前必须设置安全的 `ADMIN_BOOTSTRAP_*` 环境变量。

## 验证

按项目规则默认只做轻量验证，不进行深度测试或视觉化对比：

```bash
pnpm --filter @baichile/cloud-functions typecheck
pnpm --filter @baichile/client typecheck
pnpm build:mp-weixin
```

## 已知边界

- H5/App 不再支持本地 `127.0.0.1:3000` API fallback；后续如需调试，应接入 CloudBase 兼容调用路径。
- CloudBase collections 需要在云环境中存在；首次部署环境应先按 `apps/cloud-functions/src/collections.ts` 创建集合和索引。
- 图片仍可本地打包进小程序，生产应逐步迁到云存储/CDN 以降低包体。
