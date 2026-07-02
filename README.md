# 白吃了

外卖平台风格的虚拟消费 MVP。订单不会扣款、不会发货，地图路线与骑手位置均为虚拟演示。

## 当前能力

- uni-app Vue 3 客户端：微信小程序、H5、App 构建入口。
- 首页、搜索、分类、店铺、SKU、单店购物车、结算、配送、完成、订单和个人页。
- 12 家原创虚拟店铺、156 道菜；客户端无 API 时自动使用本地 Mock。
- NestJS/Fastify API：游客、开发态登录、目录、搜索、报价、虚拟订单、订单查询、游客合并和埋点。
- 共享金额/SKU/地图/配送状态逻辑，PostgreSQL/PostGIS 初始化结构与候选数据隔离表。

## 本地运行

需要 Node.js 20+、pnpm 11+ 与 Docker Desktop。首次运行：

```bash
pnpm install
cp .env.example apps/api/.env
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` 会同时启动 API 和微信小程序增量编译。开发者工具模拟器默认通过
`http://127.0.0.1:3000` 访问本机 API。

需要调试 H5 时使用：

```bash
VITE_API_BASE_URL=http://localhost:3000 pnpm dev:h5
```

## 微信开发者工具

日常开发先启动 API 和持续编译：

```bash
pnpm dev
```

首次在微信开发者工具中导入以下目录，之后保持开发命令运行即可自动同步代码，无需重新导入：

```text
apps/client/dist/dev/mp-weixin
```

`pnpm build:mp-weixin` 仅用于生成发布构建，输出目录是 `apps/client/dist/build/mp-weixin`，不要将它作为日常开发目录。

真机预览无法访问电脑的 `127.0.0.1`，需要使用电脑当前局域网 IP，例如：

```bash
VITE_API_BASE_URL=http://10.3.0.219:3000 pnpm dev
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

## PostgreSQL

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
```

数据库由 Docker Desktop 运行，数据保存在 Docker volume 中。游客身份、账号、地址和虚拟订单已经通过 TypeORM 持久化；停止 API 或重启电脑不会丢失。需要停止数据库时运行 `pnpm db:down`。

商品目录与埋点事件也存储在 PostgreSQL。`catalog.seed.ts` 仅作为可重复执行的初始化数据源，应用实际查询来自数据库；应用表结构由 TypeORM migration 管理。

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
