# 白吃了｜全端技术方案与微信小程序 MVP 开发文档

> 注意：本文中的 NestJS、TypeORM、PostgreSQL、Docker Compose 相关后端方案是历史设计记录，不再作为当前实现依据。当前后端架构以 `docs/腾讯云开发迁移方案.md` 为准：微信小程序 + CloudBase `api` 云函数 + 云开发文档数据库。

> 项目名称：**白吃了**  
> 首发形态：**微信小程序**  
> 长期形态：微信小程序 + H5 + iOS / Android App  
> 核心体验：用户能逛、能选、能买（虚拟下单）、能在**真实地图**上观看一名**虚拟骑手**沿一条虚拟配送路线前进。  
> 架构原则：**首发只做一个端，但从第一天避免把代码写死在微信小程序里。**

---

## 0. 本次确认的关键决策

1. **先做微信小程序，但客户端采用跨端架构。**
   - 首发只交付微信小程序。
   - 后续同一客户端项目编译到 H5 和 App；不维护三套独立前端。

2. **地图是真地图，骑手是虚拟的。**
   - 使用真实地图底图、真实城市和真实道路级路线展示。
   - 商家点、收货点、骑手状态和配送进度均为系统虚构。
   - 必须全程清晰标注“虚拟派送 / 非真实配送”。

3. **允许准备第三方平台数据采集能力，但采集结果不能直接等于公开展示内容。**
   - 第三方平台数据先进入“候选数据隔离区”，仅用于研究类目、菜品结构、价格带与规格语法。
   - 未完成授权、许可或人工审核的数据，不进入公开店铺、公开菜单、公开图片和公开评价。
   - 不实现绕过登录、验证码、访问频控、反爬或其他技术保护措施的功能。

4. **登录存在但不强制。**
   - 用户首次进入可以游客身份完成浏览、加购、虚拟下单与虚拟配送。
   - 收藏、跨设备同步、个人数据恢复、分享管理、未来社区/挑战等功能再要求登录。
   - 游客数据在登录后可合并到正式账户。

5. **所有功能图标 MVP 阶段统一使用 Emoji，并由公共注册表管理。**
   - 页面和业务组件禁止直接硬编码 Emoji。
   - 未来设计图标只替换注册表和统一图标组件，不改业务页面。

---

# 1. 产品定义

## 1.1 一句话

**白吃了**是一个外卖平台风格的虚拟消费产品：用户像使用正常外卖平台一样浏览店铺、挑选菜品、选择规格和口味、完成下单；但不会发生真实付款、真实接单和真实送餐。

## 1.2 MVP 核心链路

```text
首页浏览
→ 搜索 / 分类筛选
→ 店铺详情
→ 菜品规格与口味选择
→ 购物车
→ 提交虚拟订单
→ 创建虚拟配送路线
→ 真实地图中的虚拟骑手派送
→ 虚拟完成页
→ 订单记录 / 再次逛逛
```

## 1.3 必须展示的明确提示

以下页面必须存在非弱化提示：

```text
结算页：本订单仅为互动模拟，不会扣款、不会发货。
配送页：骑手位置与配送路线均为虚拟演示，不对应真实配送。
订单完成页：本单已完成虚拟派送，不会有餐品送达。
```

---

# 2. MVP 范围

## 2.1 MVP 必须完成

### A. 能逛

- 首页外卖平台式信息流。
- 城市/区域入口、搜索入口、分类入口、专题推荐、店铺流。
- 店铺和菜品可持续分页浏览，不是三页静态 Demo。
- 本地 Mock 数据先跑通，接口层保持可切换到真实后端。

### B. 能选

- 店铺详情、菜单分组、菜品卡片。
- 规格弹层支持必选、多选、单选、加料、口味、辣度、温度、甜度、数量。
- 同一购物车只允许一家店。
- 购物车、确认订单页、订单详情页金额必须严格一致。

### C. 能买（虚拟下单）

- 不接微信支付。
- 点击“确认虚拟下单”后，服务端创建 `isVirtual = true` 的订单。
- 用户可用游客身份完成订单。
- 登录用户订单云端保存；游客订单先本地保存，后续可合并。

### D. 能看虚拟派送

- 使用真实地图底图。
- 展示商家点、虚拟收货点、路线折线、骑手 Marker、配送时间线。
- 骑手位置按时间进度沿路线插值移动。
- 小程序切后台或重新进入后，订单根据开始时间恢复正确进度。

## 2.2 MVP 不做

```text
真实支付
真实配送
真实骑手定位
真实订单接入
实时商家接单
用户评论社区
优惠券、红包、发票、退款
多店合并购物车
复杂推荐系统
运营后台完整权限体系
```

---

# 3. 技术选型结论

## 3.1 最终推荐

| 层级 | 选择 | 为什么 |
|---|---|---|
| 客户端 | **uni-app（Vue 3 + TypeScript + Vite）** | 同一项目可先发微信小程序，再编译 H5 和 App；更适合中国移动端、多端和地图/微信生态。 |
| 状态管理 | **Pinia** | 购物车、身份、订单、城市、UI 状态清晰可拆分；比手写全局对象更稳定。 |
| UI | 自建业务组件 + 少量 uni-ui | 外卖类高密度页面需要强定制，不依赖大而全 UI 库。 |
| 后端 | **NestJS + Fastify + TypeScript** | 你已有 NestJS 经验；适合后续做账号、内容、订单、数据审核、后台和开放 API。 |
| ORM | **TypeORM 0.3 + PostgreSQL Driver** | NestJS 集成成熟；对关系模型、迁移和 PostGIS 空间字段更顺手。 |
| 主数据库 | **PostgreSQL 16/17 + PostGIS** | 店铺、菜品、订单本来就是关系数据；地图点位、距离、区域筛选、路线缓存需要空间能力。 |
| 缓存/队列 | **Redis / Valkey + BullMQ**（第二阶段接入） | 首页缓存、限流、异步图片处理、数据导入、路线预生成、埋点批处理。 |
| 文件与图片 | **腾讯云 COS + CDN** | 食物图、店铺图、用户后续上传和分享海报走对象存储，不放数据库。 |
| 地图服务 | **腾讯位置服务优先 + MapAdapter 抽象层** | 微信小程序生态天然顺；地图展示和路线服务可独立替换。 |
| 部署 | Docker Compose 起步；后续迁容器服务/托管数据库 | 先低成本稳定上线，避免一开始拆微服务。 |

## 3.2 为什么不继续用“微信原生小程序 + CloudBase”作为主架构

它能快速做出首个 Demo，但你已经明确要扩展 H5、App、可选登录、真实地图和数据采集/审核能力。若仍以 CloudBase 云函数和文档库为主，后续会出现：

```text
用户体系跨端不统一
复杂筛选、空间查询和数据审核越来越别扭
采集/导入/图片处理等后台任务不好管理
以后补 NestJS + 关系数据库会产生二次迁移
```

因此：

```text
第一天：前端仍可使用本地 Mock 数据快速开发
第一周：并行建立 NestJS API 与 PostgreSQL 基础库
首发：小程序接真实 API
后续：H5 / App 复用同一个 API 与大部分前端代码
```

## 3.3 为什么选 uni-app，而不是原生小程序、Taro 或三套独立项目

### 选 uni-app（默认方案）

- Vue 3 + TypeScript 开发体验稳定，适合快速 Vibe Coding。
- 小程序、H5、App 都是目标平台，不需要现在做三套页面。
- `map`、`storage`、网络、分享、授权等能力可先走统一 API；少量差异留在平台适配层。

### Taro 是可行备选，但不作为默认

如果你以后坚持 React 技术栈，Taro 可以覆盖小程序、H5、React Native App；但你现在没有“必须 React”的前提，而 App 地图和原生插件适配仍需要额外维护。

### 不推荐

```text
微信原生小程序 + React H5 + React Native App 三套独立项目
```

因为产品刚验证，三套页面、三套状态和三套地图适配会把开发量放大到不必要的程度。

---

# 4. 全端总体架构

```text
                        ┌─────────────────────────────┐
                        │        白吃了客户端          │
                        │  uni-app / Vue3 / TypeScript │
                        └──────────────┬──────────────┘
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
        微信小程序                    H5                       App
        mp-weixin                 Web build              iOS / Android
              │                        │                        │
              └────────────────────────┴────────────────────────┘
                                       │ HTTPS / JWT
                                       ▼
                     ┌──────────────────────────────────┐
                     │     NestJS API（模块化单体）       │
                     │ auth / catalog / order / map      │
                     │ asset / analytics / admin         │
                     └───────┬──────────────┬───────────┘
                             │              │
                 ┌───────────▼────┐   ┌─────▼──────────┐
                 │ PostgreSQL      │   │ Redis / Queue  │
                 │ + PostGIS       │   │ second phase   │
                 └─────────────────┘   └────────────────┘
                             │
                      ┌──────▼──────┐
                      │ COS + CDN    │
                      │ images/assets│
                      └──────────────┘
```

## 4.1 代码仓库建议：pnpm Monorepo

```text
baichile/
├─ apps/
│  ├─ client/                     # uni-app：小程序首发，后续编译 H5/App
│  ├─ api/                        # NestJS API
│  ├─ admin/                      # 后期运营后台，MVP 不开发
│  └─ collector/                  # 后期数据采集/导入工具，独立于 API
│
├─ packages/
│  ├─ api-contract/               # DTO、接口类型、错误码
│  ├─ domain/                     # 订单金额、规格、配送进度等纯业务逻辑
│  ├─ ui-tokens/                  # 颜色、间距、字号、圆角、阴影
│  ├─ icon-registry/              # IconKey 与 Emoji / 未来设计资源映射
│  ├─ map-core/                   # 坐标、路径插值、配送状态机、地图类型
│  ├─ catalog-schema/             # 店铺/菜单/规格数据校验 Schema
│  └─ config/                     # ESLint、TS、环境变量规范
│
├─ infra/
│  ├─ docker-compose.yml
│  ├─ nginx/
│  └─ sql/
│
└─ docs/
   ├─ product/
   ├─ api/
   ├─ data-governance/
   └─ adr/                         # 架构决策记录
```

### 核心原则

```text
页面可以跨端不同
业务规则必须只写一份
接口类型必须只写一份
地图线路和订单进度算法必须只写一份
```

---

# 5. 客户端技术方案

## 5.1 客户端目录建议

```text
apps/client/
├─ src/
│  ├─ pages/
│  │  ├─ home/
│  │  ├─ search/
│  │  ├─ category/
│  │  ├─ store/
│  │  ├─ checkout/
│  │  ├─ delivery/
│  │  ├─ orders/
│  │  ├─ profile/
│  │  └─ auth/
│  │
│  ├─ components/
│  │  ├─ AppIcon.vue
│  │  ├─ StoreCard.vue
│  │  ├─ FoodCard.vue
│  │  ├─ SkuSheet.vue
│  │  ├─ CartBar.vue
│  │  ├─ CartSheet.vue
│  │  ├─ VirtualMap.vue
│  │  ├─ DeliveryTimeline.vue
│  │  └─ LoginGate.vue
│  │
│  ├─ stores/
│  │  ├─ auth.ts
│  │  ├─ cart.ts
│  │  ├─ order.ts
│  │  ├─ location.ts
│  │  └─ app.ts
│  │
│  ├─ services/
│  │  ├─ http.ts
│  │  ├─ auth.ts
│  │  ├─ catalog.ts
│  │  ├─ order.ts
│  │  ├─ map.ts
│  │  └─ analytics.ts
│  │
│  ├─ platform/
│  │  ├─ auth/
│  │  │  ├─ index.ts
│  │  │  ├─ wechat-mini.ts
│  │  │  ├─ h5.ts
│  │  │  └─ app.ts
│  │  ├─ map/
│  │  │  ├─ index.ts
│  │  │  ├─ map-adapter.ts
│  │  │  ├─ mini.ts
│  │  │  ├─ h5.ts
│  │  │  └─ app.ts
│  │  └─ share/
│  │
│  ├─ constants/
│  │  └─ icon-registry.ts
│  │
│  ├─ mock/
│  │  ├─ stores.json
│  │  ├─ menu-items.json
│  │  └─ routes.json
│  │
│  ├─ utils/
│  │  ├─ money.ts
│  │  ├─ storage.ts
│  │  ├─ coordinate.ts
│  │  └─ permission.ts
│  │
│  ├─ App.vue
│  ├─ main.ts
│  ├─ pages.json
│  └─ manifest.json
│
├─ package.json
└─ vite.config.ts
```

## 5.2 图标硬约束：Emoji 注册表

**禁止：**

```text
在页面里直接写 🛒 / 🔍 / 📍 / ➕ / ➖
业务组件自行引用图标文件路径
同一语义在不同页面用不同 Emoji
```

**必须：**

```ts
// packages/icon-registry/src/index.ts
export type IconKey =
  | 'home'
  | 'orders'
  | 'profile'
  | 'search'
  | 'location'
  | 'back'
  | 'close'
  | 'cart'
  | 'plus'
  | 'minus'
  | 'rider'
  | 'route'
  | 'clock'
  | 'success'
  | 'empty'
  | 'error'
  | 'bbq'
  | 'friedChicken'
  | 'burger'
  | 'noodles'
  | 'rice'
  | 'milkTea'
  | 'dessert'
  | 'lateNight';

export interface IconDefinition {
  emoji: string;
  label: string;
  assetPath?: string;
}

export const ICON_REGISTRY: Record<IconKey, IconDefinition> = {
  home: { emoji: '🏠', label: '首页' },
  orders: { emoji: '📋', label: '订单' },
  profile: { emoji: '👤', label: '我的' },
  search: { emoji: '🔎', label: '搜索' },
  location: { emoji: '📍', label: '位置' },
  back: { emoji: '‹', label: '返回' },
  close: { emoji: '✕', label: '关闭' },
  cart: { emoji: '🛒', label: '购物车' },
  plus: { emoji: '＋', label: '增加' },
  minus: { emoji: '－', label: '减少' },
  rider: { emoji: '🛵', label: '虚拟骑手' },
  route: { emoji: '🗺️', label: '虚拟路线' },
  clock: { emoji: '🕒', label: '时间' },
  success: { emoji: '✨', label: '完成' },
  empty: { emoji: '🍽️', label: '暂无内容' },
  error: { emoji: '⚠️', label: '异常' },
  bbq: { emoji: '🍢', label: '烧烤' },
  friedChicken: { emoji: '🍗', label: '炸鸡' },
  burger: { emoji: '🍔', label: '汉堡' },
  noodles: { emoji: '🍜', label: '粉面' },
  rice: { emoji: '🍛', label: '盖饭' },
  milkTea: { emoji: '🧋', label: '奶茶' },
  dessert: { emoji: '🍰', label: '甜品' },
  lateNight: { emoji: '🌙', label: '夜宵' },
};
```

业务页面统一用：

```vue
<AppIcon name="cart" :size="20" />
```

后续把 `assetPath` 补上，`AppIcon` 自动优先渲染设计图标，失败时回退 Emoji。

---

# 6. 真实地图 + 虚拟骑手实现方案

## 6.1 地图的真实与虚拟边界

| 元素 | 是否真实 | 说明 |
|---|---|---|
| 地图底图 | 是 | 使用地图服务商真实地图瓦片。 |
| 城市/道路/河流/建筑区域 | 是 | 来源于地图服务。 |
| 商家坐标 | MVP 可虚拟，也可来自已合规的 POI 数据 | 不能让用户误以为是真实接单商家。 |
| 收货点 | 虚拟 | 用户不登录、不授权定位时由系统生成虚拟目的地点。 |
| 路线几何 | 可使用真实道路规划结果，也可使用预设路线 | 路线只代表虚拟订单的演示轨迹。 |
| 骑手位置 | 虚拟 | 按订单进度计算，不读取 GPS，不对应真实骑手。 |
| 状态和预计送达 | 虚拟 | 系统生成。 |

## 6.2 地图服务分层

```text
地图 UI 层
  └─ <map> / 平台地图 SDK：渲染底图、Marker、Polyline

MapAdapter
  ├─ setViewport()
  ├─ renderMarkers()
  ├─ renderPolyline()
  ├─ moveRiderMarker()
  └─ fitBounds()

Map Service（后端）
  ├─ 城市/POI 查询
  ├─ 路线基础几何生成
  ├─ 坐标系统标注与转换
  └─ 虚拟配送路线缓存

Delivery Engine（纯业务逻辑）
  ├─ 根据订单 seed 生成骑手与终点
  ├─ 生成 durationMs / timeline
  ├─ 根据 startedAt 计算 progress
  └─ 根据 progress 在线路点中插值
```

## 6.3 必须使用的坐标约束

- 所有坐标对象都带 `coordSystem` 字段，不能只保存 `lat/lng`。
- 客户端 `uni-app <map>` 渲染统一使用 **GCJ-02** 坐标。
- 数据库中的外部来源点位必须记录来源坐标系；转换只能在 `CoordinateService` 内完成。
- 禁止在页面里手写坐标转换。

```ts
export interface GeoPoint {
  lat: number;
  lng: number;
  coordSystem: 'gcj02' | 'wgs84' | 'bd09';
}
```

## 6.4 虚拟路线生成流程

```text
用户确认虚拟下单
→ 后端确定城市与虚拟终点
→ 后端读取商家点位
→ 后端生成或读取一条路线折线
→ 创建订单并保存 routePolyline、startedAt、durationMs、seed
→ 客户端打开配送页
→ 每帧按当前 progress 在折线中插值
→ 更新骑手 Marker
```

## 6.5 订单内的路线结构

```ts
export interface VirtualRoute {
  id: string;
  cityCode: string;
  origin: GeoPoint;
  destination: GeoPoint;
  polyline: GeoPoint[];
  routeSource: 'prebuilt' | 'map-planning' | 'generated';
  label: '虚拟配送路线';
}
```

## 6.6 骑手位置计算

```ts
const progress = Math.min(
  1,
  Math.max(0, (Date.now() - order.startedAt) / order.durationMs),
);

const riderPoint = interpolateAlongPolyline(order.route.polyline, progress);
```

**不允许**把 `setInterval` 累加值当作唯一真相。  
`startedAt + durationMs` 才是订单进度的唯一事实来源。

## 6.7 首发地图交互

- 默认城市：由手动城市选择确定，不申请定位权限。
- 可选功能：用户点击“以当前位置为中心”后再请求定位权限。
- 不保存精确位置；MVP 只保存 `cityCode` 和可选 `districtCode`。
- 配送页可展示真实地图，但固定加一行：

```text
本路线为虚拟派送演示，不代表真实骑手位置。
```

---

# 7. 账号与登录方案：游客可用，登录后升级

## 7.1 身份层级

```text
游客 Visitor
→ 可浏览、加购、虚拟下单、看配送
→ 数据存本地 + 服务端匿名 token

登录用户 Account
→ 订单云同步、跨设备恢复、收藏、个人统计、后续挑战/社交
```

## 7.2 客户端首次启动

```text
首次启动
→ 本地生成 visitorId（UUID）
→ POST /v1/auth/guest
→ 后端返回短期 accessToken + 可刷新 refreshToken
→ 用户不需要点登录即可使用
```

## 7.3 微信小程序可选登录

```text
用户主动点“微信登录”
→ 调用 wx.login 获取 code
→ POST /v1/auth/wechat-mini
→ 后端向微信服务换取身份标识
→ 建立 identity 与 account
→ 合并 visitorId 下的订单、收藏和偏好
→ 客户端切换为登录态
```

## 7.4 H5 / App 后续登录

| 平台 | MVP 后首选登录方式 |
|---|---|
| 微信小程序 | 微信登录 |
| 微信内 H5 | 微信网页授权 |
| 普通浏览器 H5 | 手机号验证码或密码less 登录 |
| App | 微信登录 + 手机号验证码 |

## 7.5 登录拦截原则

不在首页弹“请登录”。只有以下场景进入 `LoginGate`：

```text
同步到云端
收藏/管理个人收藏
查看跨设备订单历史
生成长期个人报告
创建或加入挑战
未来社区互动
```

## 7.6 游客数据合并规则

```text
购物车：保留最新更新的一份
订单：按 orderId 去重，全部迁移到 accountId
收藏：去重合并
搜索历史：最多保留最近 30 条
埋点：不回写归属，只保留匿名链路
```

---

# 8. 后端模块与接口边界

## 8.1 NestJS 模块划分

```text
apps/api/src/modules/
├─ auth/           # 游客、微信登录、token、身份合并
├─ account/        # 用户资料与偏好
├─ catalog/        # 分类、店铺、菜单、SKU、搜索
├─ cart/           # 后期可选服务端购物车
├─ order/          # 虚拟订单、金额校验、订单状态
├─ delivery/       # 虚拟路线、进度计算、配送状态
├─ map/            # 地图服务适配、城市、路线缓存
├─ asset/          # COS 签名、图片素材元数据
├─ analytics/      # 埋点入库/聚合
├─ ingestion/      # 数据导入、候选数据审核
├─ admin/          # 后期运营后台 API
└─ health/         # 健康检查
```

## 8.2 MVP API 清单

```text
POST   /v1/auth/guest
POST   /v1/auth/wechat-mini
POST   /v1/auth/merge-visitor
GET    /v1/catalog/home
GET    /v1/catalog/categories
GET    /v1/catalog/stores
GET    /v1/catalog/stores/:storeId
GET    /v1/catalog/search
POST   /v1/orders/quote
POST   /v1/orders/virtual
GET    /v1/orders/:orderId
GET    /v1/orders/me
POST   /v1/analytics/events
```

## 8.3 下单必须由后端校验

客户端只传：

```ts
{
  storeId,
  lines: [
    { menuItemId, optionIds, quantity }
  ],
  virtualDestinationId,
}
```

后端负责：

```text
校验菜品与规格是否存在
按服务端价格重算金额
创建 isVirtual = true 的订单
生成虚拟路线
生成 startedAt、durationMs、timeline、seed
返回订单详情
```

---

# 9. 数据库方案：PostgreSQL + PostGIS

## 9.1 为什么不是 MySQL

MySQL 能完成常规店铺、菜单、订单表，但这个产品已经有明确地图和路线需求。PostgreSQL + PostGIS 更适合处理：

```text
城市/区域筛选
附近店铺
地图点位
配送路线折线
地理范围查询
空间索引
未来的用户常用区域和热力分析
```

## 9.2 核心表

```text
accounts
identities
visitor_sessions
refresh_tokens

cities
virtual_destinations
stores
store_locations
menu_categories
menu_items
menu_item_spec_groups
menu_item_spec_options
assets

carts
cart_lines
virtual_orders
virtual_order_lines
virtual_routes

analytics_events

source_records
catalog_candidates
catalog_review_logs
```

## 9.3 关键数据模型

### 店铺

```ts
interface Store {
  id: string;
  name: string;
  displayStatus: 'published' | 'hidden' | 'draft';
  sourceType: 'original' | 'licensed' | 'authorized' | 'derived';
  categoryId: string;
  coverAssetId: string | null;
  deliveryFeeCents: number;
  packingFeeCents: number;
  minimumOrderCents: number;
  locationId: string | null;
  systemHeat: number;
}
```

### 菜品

```ts
interface MenuItem {
  id: string;
  storeId: string;
  name: string;
  subtitle: string | null;
  basePriceCents: number;
  assetId: string | null;
  sourceType: 'original' | 'licensed' | 'authorized' | 'derived';
  status: 'published' | 'draft' | 'hidden';
}
```

### 素材

```ts
interface Asset {
  id: string;
  objectKey: string;
  kind: 'food' | 'store-cover' | 'banner' | 'icon';
  rightsStatus: 'owned' | 'licensed' | 'authorized' | 'pending-review' | 'blocked';
  sourceUrl: string | null;
  sourceNote: string | null;
  licenseProofKey: string | null;
  perceptualHash: string | null;
}
```

### 虚拟订单

```ts
interface VirtualOrder {
  id: string;
  accountId: string | null;
  visitorId: string | null;
  isVirtual: true;
  status:
    | 'created'
    | 'merchant_accepted'
    | 'preparing'
    | 'rider_assigned'
    | 'picked_up'
    | 'delivering'
    | 'virtual_arrived'
    | 'completed';
  startedAt: Date;
  durationMs: number;
  seed: string;
  routeId: string;
  totalCents: number;
}
```

## 9.4 数据库约束

```text
所有金额使用整数分，不用浮点
所有订单必须 is_virtual = true
虚拟路线与订单一对一绑定
公开资产必须 rights_status ∈ owned / licensed / authorized
候选采集数据默认不可公开
```

---

# 10. 数据来源与采集治理

## 10.1 先说结论

你可以建设“数据采集能力”，但**不能把爬到的平台内容直接当成白吃了公开内容库**。

原因不是技术，而是来源数据的使用权、平台规则、图片版权、商家名称、评论、销量、价格和用户误认风险都需要单独判断。

## 10.2 四层数据来源

| 层级 | 来源 | 可否直接公开 | 用途 |
|---|---|---|---|
| A | 自建 / 自拍 / AI 生成 / 明确商用授权素材 | 可以，经过素材审核 | 食物图、店铺封面、虚拟菜单 |
| B | 商家主动授权或合作提交 | 可以，按授权范围 | 真实商家试点、真实品牌专区 |
| C | 地图服务商的合规 POI/地理服务 | 按服务条款与展示规范 | 城市、地点、地图展示、搜索参考 |
| D | 第三方平台采集到的公开页面信息 | 默认不可以直接公开 | 仅做候选、研究、结构化参考与人工审核 |

## 10.3 第三方平台数据的正确落点

```text
数据采集
→ source_records（原始来源登记）
→ catalog_candidates（候选数据，不对外）
→ 结构化抽取：菜系、价格带、规格类型、通用标签
→ 人工审核与原创改写
→ 生成白吃了自己的店铺/菜单/素材
→ published catalog（对外）
```

### 候选数据可以提炼什么

```text
品类结构：烧烤、奶茶、粉面、盖饭等
规格语法：辣度、甜度、冰量、加料、份量
价格带：低 / 中 / 高
菜品组合规律：单品、套餐、小吃、饮品
页面字段结构：店铺、分类、SKU、规格组
```

### 默认不直接公开什么

```text
真实平台 Logo
真实平台页面截图
真实商家 Logo/封面/商品图
真实评价、销量、评分、评论
真实优惠券文案和营销活动
平台接口数据、反序列化接口响应
未经授权的商家名称、商品标题、价格和图片原样搬运
```

## 10.4 采集服务技术边界

`apps/collector` 只负责受允许来源的数据导入与候选数据管理，不是线上请求链路的一部分。

```text
collector 不持有生产数据库写入权限
collector 只能写 source_records 与 catalog_candidates
published 需要人工审核或受控发布任务
不做验证码绕过、登录绕过、反爬绕过、频控规避
不把采集器部署为公开 API
```

## 10.5 素材图来源

首批图片建议：

```text
自生成 / 自拍 / 明确可商用图库：主来源
商家授权素材：后续补充
采集到的第三方商品图：默认仅做内部参考，不上生产
```

所有图片必须写入 `assets.rights_status`，否则前台不允许加载。

---

# 11. 页面与交互

## 11.1 页面列表

| 页面 | 小程序首发 | H5/App 复用 | MVP 功能 |
|---|---:|---:|---|
| 首页 | 是 | 是 | 城市、搜索、分类、专题推荐、店铺流 |
| 搜索 | 是 | 是 | 搜店、搜菜、历史记录 |
| 分类页 | 是 | 是 | 分类筛选、分页店铺流 |
| 店铺详情 | 是 | 是 | 菜单、规格、加购、购物车 |
| 结算页 | 是 | 是 | 虚拟目的地、金额、下单 |
| 配送页 | 是 | 是 | 真地图、虚拟路线、骑手、时间线 |
| 订单列表 | 是 | 是 | 游客本地订单/登录云端订单 |
| 我的 | 是 | 是 | 登录入口、最近订单、说明 |
| 登录页/弹层 | 是 | 是 | 按功能触发 |

## 11.2 首页

```text
顶部：城市入口 + 搜索入口
分类：横向 Emoji 图标入口
专题：今晚想吃什么 / 深夜热榜 / 低预算解馋
店铺流：封面、店名、标签、系统热度、虚拟配送时间、起送价
底部：自定义 TabBar（Emoji 占位）
```

## 11.3 店铺页

```text
店铺头图、店名、店铺标签、虚拟配送说明
菜单分类吸顶
菜品列表
SKU 规格弹层
购物车底栏
```

## 11.4 结算页

```text
虚拟收货地点
店铺与菜品清单
配送费、打包费、商品小计
“不会扣款、不会发货”说明
确认虚拟下单按钮
```

### 虚拟收货地点例子

```text
我的书桌边
沙发左侧
卧室门口
今晚的秘密基地
夜航市·第 7 街区
```

## 11.5 配送页

```text
真实地图底图
商家 Marker
虚拟收货点 Marker
虚拟骑手 Marker
路线 Polyline
预计虚拟送达倒计时
订单状态时间线
订单摘要
固定虚拟路线说明
```

---

# 12. 菜单、SKU 与金额规则

## 12.1 菜品模型

```ts
export interface SpecOption {
  id: string;
  name: string;
  priceDeltaCents: number;
  isDefault?: boolean;
}

export interface SpecGroup {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: SpecOption[];
}

export interface MenuItem {
  id: string;
  storeId: string;
  categoryId: string;
  name: string;
  subtitle?: string;
  imageAssetId?: string;
  basePriceCents: number;
  specGroups: SpecGroup[];
}
```

## 12.2 金额规则

```text
商品单价 = basePriceCents + 已选规格 priceDeltaCents 之和
商品总价 = 商品单价 × quantity
订单总价 = 商品总价 + deliveryFeeCents + packingFeeCents
```

所有金额服务端重算。前端金额只做展示。

---

# 13. 订单状态机与配送节奏

```text
CART
→ CREATED
→ MERCHANT_ACCEPTED
→ PREPARING
→ RIDER_ASSIGNED
→ PICKED_UP
→ DELIVERING
→ VIRTUAL_ARRIVED
→ COMPLETED
```

| 阶段 | 建议演示时长 | 文案示例 |
|---|---:|---|
| 创建 | 0–2 秒 | 虚拟订单已创建，正在通知商家 |
| 接单 | 2–5 秒 | 商家已接单，正在备餐 |
| 制作 | 5–10 秒 | 厨房正在加急制作 |
| 骑手接单 | 10–15 秒 | 白吃了骑手已接单 |
| 取餐 | 15–20 秒 | 骑手已取餐，准备出发 |
| 配送 | 20–50 秒 | 骑手正在前往虚拟目的地 |
| 虚拟到达 | 50 秒后 | 已到达虚拟终点，本单不会送达 |

---

# 14. 数据量与内容填充目标

## 14.1 首发数据量

| 内容 | 首发目标 | 说明 |
|---|---:|---|
| 一级分类 | 8 | 烧烤、炸鸡、汉堡、粉面、盖饭、奶茶、甜品、夜宵 |
| 店铺 | 60–80 | 足够支撑首页和分类分页 |
| 菜品 | 800–1,200 | 每店 12–18 个核心菜品 |
| SKU 组合 | 3,000+ | 由规格、口味、加料产生 |
| 食物图 | 150–220 | 同类适度复用，避免同屏重复 |
| 店铺/专题图 | 40–60 | 店铺封面、活动 Banner |
| 预设虚拟路线 | 30–60 | 按城市/区域/店铺类型分配 |

## 14.2 首页数据展示

初始阶段不要伪装真实交易数据：

```text
使用：系统热度、夜航推荐、上头指数、虚拟配送时间
不使用：真实月售、真实评分、真实评价数、虚构“已有多少人购买”
```

接入真实埋点后，可以展示白吃了自身的真实行为数据，例如“本周被加入购物车次数”。

---

# 15. MVP 开发里程碑

## 里程碑 A：跨端骨架与 Mock 体验

```text
创建 pnpm monorepo
创建 uni-app Vue3 客户端
建立 ui-tokens、icon-registry、map-core、api-contract
配置自定义 TabBar
首页 / 店铺页 / SKU 弹层 / 单店购物车
导入本地 Mock 店铺与菜单
```

**验收：** 在微信开发者工具可完整走“浏览 → 选规格 → 加购”。

## 里程碑 B：虚拟订单与真地图配送

```text
建立 NestJS API 基础项目
创建 PostgreSQL 基础表与迁移
下单服务端重算金额
创建虚拟订单
接入真实地图渲染
渲染虚拟路线与骑手 Marker
后台恢复进度
```

**验收：** 游客能完成一单虚拟下单，地图上骑手会移动，切后台回来进度正确。

## 里程碑 C：游客身份与可选登录

```text
游客 token
微信小程序主动登录
游客数据合并
登录拦截组件 LoginGate
订单云端读取
```

**验收：** 不登录能下单；登录后能看到和合并历史订单。

## 里程碑 D：内容和素材管线

```text
素材入 COS
assets 权利状态校验
seed catalog 导入
候选数据隔离区
店铺/菜单发布状态
```

**验收：** 60+ 店、800+ 菜、图片可稳定加载；不合规素材不会出现在前台。

## 里程碑 E：H5 / App 预演

```text
编译 H5 并验证首页、店铺、结算、地图
补齐 H5 地图与分享适配
构建 App 调试包
补齐 App 地图、登录、分享差异
```

**验收：** 同一核心链路在三端均可运行；平台差异只存在于 adapter 目录。

---

# 16. MVP 验收标准

1. 小程序首屏可浏览至少 30 家店，无明显空白或卡死。
2. 任意店铺至少 10 个菜品，70% 菜品有规格组合。
3. 用户可不登录完成虚拟下单。
4. 用户可主动登录，游客订单可合并。
5. 不出现微信支付、真实接单、真实配送语义。
6. 地图为真实地图，骑手路线和位置明确标记为虚拟演示。
7. 骑手路径实际可见，切后台 10 秒后恢复正确进度。
8. 订单金额在购物车、结算、订单详情三处完全一致。
9. 所有业务图标来自 `icon-registry`，无硬编码 Emoji。
10. 未审核/无权利状态的素材不能被公开接口返回。
11. 在微信真机连续完整走 3 单，无阻断性 Bug。

---

# 17. 明天交给 Codex 的首条指令

```text
你现在负责开发项目“白吃了”。

产品定位：外卖平台风格的虚拟下单产品。首发交付微信小程序，但工程必须从第一天支持后续扩展到 H5 和 iOS/Android App。用户可以浏览店铺和菜品、选择规格/口味/加料、加入购物车、提交一笔不会扣款也不会送达的虚拟订单，并在真实地图上观看虚拟骑手沿虚拟配送路线前进。

技术决策：
1. 客户端使用 uni-app + Vue 3 + TypeScript + Vite + Pinia；首发只编译 mp-weixin，但不得写死微信原生页面结构。
2. 仓库使用 pnpm workspace monorepo，包含 apps/client、apps/api、packages/api-contract、packages/domain、packages/ui-tokens、packages/icon-registry、packages/map-core。
3. 后端未来使用 NestJS + Fastify + TypeORM + PostgreSQL/PostGIS；当前第一阶段先建立 API contract 和 mock adapter，不要求立刻接真实数据库。
4. 所有功能图标 MVP 先用 Emoji，但只能在 packages/icon-registry 内注册。页面、WXML/Vue 模板、业务组件禁止硬编码 Emoji。必须实现 AppIcon 统一组件，未来替换设计图标时只改注册表。
5. TabBar 必须使用自定义实现，以便使用 AppIcon 渲染 Emoji 占位图标。
6. 订单必须标记 isVirtual: true。结算页、配送页和完成页必须清楚提示：不会扣款、不会发货；骑手路线与位置均为虚拟演示。
7. 地图使用真实地图底图，但骑手和路线为虚拟。建立 packages/map-core，包含 GeoPoint、VirtualRoute、配送进度计算和 polyline 插值。所有坐标带 coordSystem 字段；客户端地图渲染使用 gcj02。
8. 首发不接微信支付、不接真实配送、不做真实骑手定位。
9. 用户可游客使用。先实现 visitorId、本地订单与 auth store 接口；未来微信登录只作为可选登录能力。不要在首页强制登录。
10. 购物车只能保存一家店商品，跨店加购必须弹窗确认清空。
11. 菜品、图片和店铺先使用本地 Mock 数据。任何第三方平台采集数据只允许作为候选/参考数据，不得直接暴露到前台；不要实现绕过登录、验证码、访问限制或反爬措施的功能。

现在只做里程碑 A：
- 创建 monorepo 项目骨架。
- 创建 uni-app Vue3 客户端，可在微信开发者工具运行。
- 创建全局 ui tokens、icon registry、AppIcon 和 custom tab bar。
- 创建首页、店铺详情页、SKU 规格弹层、单店购物车、Mock 数据层。
- 创建 packages/map-core 的类型与虚拟路线插值单元测试，但当前不接地图 SDK、不做订单页。
- 页面视觉要像成熟外卖平台，但不得复刻美团、饿了么、抖音外卖的 Logo、品牌色、图标、店铺、商品图、文字或具体页面细节。

工作方式：先输出开发计划、目录结构、关键类型定义和页面状态图，等我确认后再开始写代码。完成后列出新增文件、运行方式、已实现内容、未实现内容，以及下一步建议。
```

---

# 18. 架构决策摘要

```text
首发端：微信小程序
前端框架：uni-app Vue3 + TypeScript
后端：NestJS + Fastify
数据库：PostgreSQL + PostGIS
缓存/队列：Redis/Valkey + BullMQ（第二阶段）
静态资源：腾讯云 COS + CDN
地图：腾讯位置服务优先，MapAdapter 隔离平台差异
用户：游客可用，登录可选，后续按功能触发登录
订单：100% 虚拟，服务端金额校验与路线生成
数据：自有/授权内容为生产来源；第三方采集数据仅入候选隔离区
图标：Emoji 统一注册，后期可无痛替换
```
