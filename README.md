# 白吃了

外卖平台风格的虚拟消费 MVP。订单不会扣款、不会发货，地图路线与骑手位置均为虚拟演示。

## 当前能力

- uni-app Vue 3 客户端：微信小程序、H5、App 构建入口。
- 首页、搜索、分类、店铺、SKU、单店购物车、结算、配送、完成、订单和个人页。
- 12 家原创虚拟店铺、156 道菜；客户端无 API 时自动使用本地 Mock。
- NestJS/Fastify API：游客、开发态登录、目录、搜索、报价、虚拟订单、订单查询、游客合并和埋点。
- 共享金额/SKU/地图/配送状态逻辑，PostgreSQL/PostGIS 初始化结构与候选数据隔离表。

## 本地运行

需要 Node.js 20+ 与 pnpm 11+。

```bash
pnpm install
cp .env.example .env
pnpm dev:api
```

另开终端启动 H5：

```bash
VITE_API_BASE_URL=http://localhost:3000 pnpm dev:h5
```

不启动 API 也能运行客户端，此时使用本地 Mock，并在配送页显示明确标记的开发路线预览。

## 微信开发者工具

```bash
pnpm build:mp-weixin
```

在微信开发者工具中导入：

```text
apps/client/dist/build/mp-weixin
```

目前没有正式 AppID。申请小程序后：

1. 把 AppID 写入 `apps/client/src/manifest.json` 的 `mp-weixin.appid`。
2. 在小程序后台配置合法 request 域名；本地联调可暂时关闭域名校验。
3. 配置后端的 `WECHAT_MINI_APP_ID` 与 `WECHAT_MINI_APP_SECRET`。
4. 将开发态模拟登录替换为真实 `wx.login` code 交换；生产环境已禁止模拟登录。

## 腾讯位置服务

1. 注册腾讯位置服务并创建适用于微信小程序的 Key。
2. 将 Key 配置为 `VITE_TENCENT_MAP_KEY`。
   - 推荐同时在 API 环境配置 `TENCENT_MAP_KEY`，客户端通过 `/v1/map/reverse-geocode` 获取市/区县信息，避免暴露服务端 Key。
3. 在微信小程序后台添加地图服务所需域名。
4. 接入前配送页会明确显示“开发预览 · 预设 GCJ-02 路线”，不会伪装成真实地图。

## PostgreSQL/PostGIS

```bash
docker compose -f infra/docker-compose.yml up -d
```

初始化脚本位于 `infra/sql/001_init.sql`。当前本地 API 使用进程内存储保证零配置启动；数据库结构已就绪，生产部署前需将订单、身份与目录 repository 切换到 TypeORM/PostgreSQL adapter。

## 验证

```bash
pnpm test
pnpm typecheck
pnpm build:h5
pnpm build:mp-weixin
```

按项目规则默认只执行以上轻量验证，不进行深度测试或视觉化对比。

## 已知边界

- 当前内容是精简种子数据，尚未扩充到 60–80 店、800+ 菜。
- 未配置微信、腾讯地图和 COS 凭证；相关 adapter 与配置入口已预留。
- 视觉仅完成必要布局，等待 HTML 设计稿后再统一实现。
- App 原生地图、登录与分享仍需在 HBuilderX/真机和正式凭证环境中联调。
