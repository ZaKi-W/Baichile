# CloudBase 原生后端

这个包是白吃了唯一后端实现。小程序和后台都调用 `api` 云函数，运行时数据只来自腾讯云开发文档数据库。

## 环境变量

- `CLOUDBASE_ENV_ID` / `TCB_ENV`：云开发环境 ID。
- `WECHAT_MINI_APP_ID`、`WECHAT_MINI_APP_SECRET`：微信登录与手机号能力。
- `TENCENT_MAP_KEY`：腾讯位置服务服务端 Key。
- `ADMIN_BOOTSTRAP_USERNAME`、`ADMIN_BOOTSTRAP_PASSWORD`、`ADMIN_BOOTSTRAP_DISPLAY_NAME`：首次初始化后台管理员。
- `CATALOG_IMAGE_BASE_URL`：可选，目录图片迁到云存储/CDN 后用于重写图片 URL。

## 云函数入口

事件结构：

```json
{
  "method": "GET",
  "path": "/v1/catalog/home",
  "query": {},
  "data": {},
  "authorization": "Bearer account.xxx"
}
```

成功返回：

```json
{ "ok": true, "status": 200, "data": {} }
```

失败返回：

```json
{ "ok": false, "status": 400, "code": "BAD_REQUEST", "message": "请求内容不正确" }
```

## 数据维护

店铺、分类和菜单的源数据在 `packages/catalog-data`。改名或改菜单后同步到 CloudBase：

```bash
CLOUDBASE_ENV_ID=cloud1-d8g7o18ula3c12f10 pnpm --filter @baichile/cloud-functions seed:catalog
CLOUDBASE_ENV_ID=cloud1-d8g7o18ula3c12f10 pnpm --filter @baichile/cloud-functions verify:cloudbase
```

导入历史 CloudBase JSON：

```bash
CLOUDBASE_ENV_ID=cloud1-d8g7o18ula3c12f10 pnpm --filter @baichile/cloud-functions import:cloudbase
```

迁移目录图片：

```bash
CLOUDBASE_ENV_ID=cloud1-d8g7o18ula3c12f10 \
CATALOG_IMAGE_BASE_URL=https://example.com/choutuan-img \
pnpm --filter @baichile/cloud-functions migrate:catalog-images
```

## 部署准备

```bash
pnpm --filter @baichile/cloud-functions build
pnpm --filter @baichile/cloud-functions prepare:deploy
```

`deploy-functions/api` 是生成后的云函数部署目录，不应手工编辑。
