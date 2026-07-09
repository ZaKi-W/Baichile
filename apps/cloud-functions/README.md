# CloudBase 原生后端

这个包承载白吃了迁移到腾讯云云开发后的原生后端实现。

## 部署前配置

- `CLOUDBASE_ENV_ID` / `TCB_ENV`：云开发环境 ID。
- `WECHAT_MINI_APP_ID`、`WECHAT_MINI_APP_SECRET`：微信登录与手机号能力。
- `TENCENT_MAP_KEY`：腾讯位置服务服务端 Key。
- `ADMIN_BOOTSTRAP_USERNAME`、`ADMIN_BOOTSTRAP_PASSWORD`、`ADMIN_BOOTSTRAP_DISPLAY_NAME`：首次初始化后台管理员。

## 云函数入口

小程序和后台统一调用 `api` 云函数，事件结构：

```json
{
  "method": "GET",
  "path": "/v1/catalog/home",
  "query": {},
  "data": {},
  "authorization": "Bearer account.xxx"
}
```

返回结构：

```json
{ "ok": true, "status": 200, "data": {} }
```

失败时：

```json
{ "ok": false, "status": 400, "code": "BAD_REQUEST", "message": "请求内容不正确" }
```

## 迁移流程

```bash
DATABASE_URL=postgresql://... pnpm --filter @baichile/cloud-functions export:postgres
CLOUDBASE_ENV_ID=xxx pnpm --filter @baichile/cloud-functions import:cloudbase
CLOUDBASE_ENV_ID=xxx pnpm --filter @baichile/cloud-functions verify:cloudbase
```
