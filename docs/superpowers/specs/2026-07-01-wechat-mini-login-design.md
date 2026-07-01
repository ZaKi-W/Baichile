# 微信小程序登录与用户资料设计

## 目标

为微信小程序提供可选的真实微信登录能力。用户登录后，个人中心显示其头像和昵称，并自动合并当前游客身份下的订单。未登录用户仍可继续浏览和下单，不在首页强制登录。

## 范围

- 小程序调用 `uni.login` 获取微信临时登录凭证 `code`。
- API 使用小程序 AppID 和 AppSecret 调用微信 `jscode2session`，以 `openid` 建立稳定账户。
- 非生产环境缺少微信密钥时，API 可返回明确标记的开发模拟账户；生产环境禁止回退。
- 用户通过微信小程序原生 `button open-type="chooseAvatar"` 主动选择头像，通过 `input type="nickname"` 主动填写昵称。
- 客户端保存账户、登录令牌和用户资料，并在个人中心展示。
- 登录成功后合并当前 `visitorId` 对应的游客订单。
- 不实现手机号登录、强制登录、跨设备资料数据库持久化、刷新令牌轮换或后台账户管理。

## 客户端设计

### Auth Store

`auth` store 增加：

- `userProfile`：包含 `avatarUrl` 和 `nickname`。
- 登录会话本地存储键，保存 `accountId`、`accessToken`、`provider` 与 `userProfile`。
- `wechatLogin(profile)`：先调用 `uni.login({ provider: "weixin" })`，再请求 `POST /v1/auth/wechat-mini`，最后合并游客订单并持久化登录态。
- `setUserProfile(profile)`：更新已登录用户资料并同步本地存储。
- 初始化时恢复游客会话和已有登录会话。

登录请求失败时保持原游客身份，不清除游客订单。重复点击登录期间由页面 loading 状态阻止重复请求。

### 个人中心

未登录时显示默认头像、游客文案、头像选择器、昵称输入框和“微信登录”按钮。用户必须选择头像并填写非空昵称后才能提交。

登录后显示真实头像、昵称和“已登录”状态，不再显示登录表单。头像加载失败时使用本地样式化占位头像。

头像与昵称获取使用微信当前原生能力，不依赖已不适合稳定获取资料的旧式 `getUserProfile` 流程。

## API 设计

### 请求

`POST /v1/auth/wechat-mini`

```json
{
  "code": "wx-login-code",
  "visitorId": "visitor_xxx",
  "profile": {
    "avatarUrl": "https://...",
    "nickname": "用户昵称"
  }
}
```

### 响应

```json
{
  "accountId": "account_xxx",
  "accessToken": "account.xxx",
  "provider": "wechat",
  "profile": {
    "avatarUrl": "https://...",
    "nickname": "用户昵称"
  }
}
```

开发回退时 `provider` 为 `dev-mock`。

### 服务端行为

服务端读取 `WECHAT_MINI_APP_ID` 和 `WECHAT_MINI_APP_SECRET`。配置完整时调用微信 `jscode2session`，校验响应后根据 `openid` 生成确定性的账户标识。配置缺失且非生产环境时返回开发模拟账户；生产环境配置缺失或微信接口拒绝 code 时返回可识别的登录错误。

当前项目没有账户数据库，因此本次仅以微信 `openid` 派生稳定 `accountId`，资料由客户端持久化。该边界不会伪装成已实现跨设备资料同步。

## 数据与安全

- AppSecret 只存在于 API 环境变量，绝不写入小程序包、仓库或响应。
- 服务端不把 `openid` 或 `session_key` 返回给客户端。
- 昵称去除首尾空白并限制长度；头像必须为非空字符串。
- 客户端仅将账户令牌用于现有 API 请求，不在日志中输出登录 code 或令牌。

## 错误处理

- 用户未选择头像或昵称为空：页面提示补全资料，不发起登录请求。
- `uni.login` 失败、网络失败或微信 code 无效：显示“登录失败，请重试”，保留输入和游客态。
- 游客订单合并失败：保留已取得的登录态并提示订单同步失败，允许后续重试，不重复创建账户。
- 开发环境未配置密钥：使用 `dev-mock`，页面仍按登录态展示资料。

## 验证

采用轻量、针对性验证：

- Auth service 单元/API 测试覆盖真实配置缺失时的开发回退、生产禁用回退以及响应不泄露微信身份字段。
- Auth store 测试覆盖 `uni.login` code 传递、资料持久化和失败时保留游客态。
- 个人中心测试覆盖资料不完整时禁止提交，以及登录后头像昵称展示。
- 运行相关测试、客户端类型检查和微信小程序构建；不执行深度测试或视觉化对比。

