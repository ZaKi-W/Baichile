# CloudBase 原生后端

这个包是白吃了唯一后端实现。小程序和后台都调用 `api` 云函数，运行时数据只来自腾讯云开发文档数据库。

## 环境变量

- `CLOUDBASE_ENV_ID` / `TCB_ENV`：云开发环境 ID。
- `WECHAT_MINI_APP_ID`、`WECHAT_MINI_APP_SECRET`：微信登录与手机号能力。
- `TENCENT_MAP_KEY`：腾讯位置服务服务端 Key。
- `ADMIN_BOOTSTRAP_USERNAME`、`ADMIN_BOOTSTRAP_PASSWORD`、`ADMIN_BOOTSTRAP_DISPLAY_NAME`：首次初始化后台管理员。
- `CATALOG_IMAGE_BASE_URL`：必填的 HTTPS CDN 前缀。目录图片只允许使用 CDN URL，不使用本地路径或 `cloud://` 临时链接。

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
export CLOUDBASE_ENV_ID=your-env-id
export TENCENTCLOUD_SECRETID=...
export TENCENTCLOUD_SECRETKEY=...
# 临时凭证还需设置 TENCENTCLOUD_SESSIONTOKEN

# 先检查，再幂等创建集合/缺失索引并强制 PRIVATE 权限。
pnpm cloudbase:apply-schema
CLOUDBASE_SCHEMA_APPLY=true \
  CLOUDBASE_SCHEMA_STATE_FILE=/tmp/baichile-schema-state.json \
  pnpm cloudbase:apply-schema

pnpm --filter @baichile/cloud-functions seed:catalog
CLOUDBASE_SCHEMA_STATE_FILE=/tmp/baichile-schema-state.json \
  pnpm --filter @baichile/cloud-functions verify:cloudbase
```

`cloudbase:apply-schema` 不删除集合或索引。若同名索引定义与清单冲突，脚本会停止并要求人工审阅。
只有显式提供 `CLOUDBASE_EXPORT_FILE` 时，校验脚本才比较导出文件中的精确记录数，避免把用户维护的目录数据误判为异常。

导入历史 CloudBase JSON：

```bash
pnpm --filter @baichile/cloud-functions import:cloudbase
```

迁移目录图片：

```bash
CATALOG_IMAGE_BASE_URL=https://example.com/choutuan-img \
pnpm --filter @baichile/cloud-functions migrate:catalog-images
```

## 部署准备

```bash
pnpm --filter @baichile/cloud-functions build
pnpm --filter @baichile/cloud-functions prepare:deploy
```

`deploy-functions/api` 是生成后的云函数部署目录，不应手工编辑。
