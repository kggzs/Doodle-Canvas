# API 参考

更新时间：2026-06-21

统一前缀：`/api`  
统一响应：

```json
{
  "code": 0,
  "message": "操作成功",
  "data": {}
}
```

分页接口通常返回：

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

## 认证

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| POST | `/auth/register` | 邮箱注册 | 否 |
| POST | `/auth/verify-email` | 邮箱验证码激活 | 否 |
| POST | `/auth/resend-verification` | 重发注册验证码 | 否 |
| POST | `/auth/check-email` | 检查邮箱是否存在 | 否 |
| POST | `/auth/login` | 登录 | 否 |
| POST | `/auth/logout` | 退出登录 | 是 |
| POST | `/auth/refresh` | 刷新 token | Refresh Token |
| GET | `/auth/me` | 当前用户信息 | 是 |
| PUT | `/auth/password` | 修改密码 | 是 |
| POST | `/auth/forgot-password` | 发送重置验证码 | 否 |
| POST | `/auth/reset-password` | 重置密码 | 否 |
| POST | `/auth/change-email` | 发送换绑邮箱验证码 | 是 |
| GET | `/auth/sessions` | 会话列表 | 是 |
| DELETE | `/auth/sessions/:id` | 注销会话 | 是 |
| GET | `/auth/login-logs` | 登录记录 | 是 |

## 模型

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| GET | `/models` | 按类型分组返回可用模型 | 否 |
| GET | `/models/:type` | 返回某类型可用模型 | 否 |
| GET | `/models/detail/:idOrKey` | 返回模型详情 | 否 |

`type` 可选：`chat`、`image`、`video`。

## 生成

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| POST | `/generate/image` | 图片生成 | 是 |
| GET | `/generate/image/:taskId` | 图片异步任务占位查询 | 是 |
| POST | `/generate/video` | 视频生成任务 | 是 |
| GET | `/generate/video/:taskId` | 视频任务状态 | 是 |

图片生成请求示例：

```json
{
  "model": "image-model-key",
  "prompt": "一张产品海报",
  "size": "1024x1024",
  "n": 1,
  "project_id": "uuid"
}
```

视频生成请求示例：

```json
{
  "model": "video-model-key",
  "prompt": "镜头缓慢推进",
  "first_frame_image": "https://example.com/image.png",
  "dur": 5,
  "project_id": "uuid"
}
```

## 对话

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| POST | `/chat/completions` | 非流式对话 | 是 |
| POST | `/chat/completions/stream` | SSE 流式对话 | 是 |

## 金币与计费

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| GET | `/coins/balance` | 当前余额 | 是 |
| GET | `/coins/summary` | 金币统计 | 是 |
| GET | `/coins/transactions` | 金币流水 | 是 |
| GET | `/billing/pricing` | 公开价格 | 可选 |
| GET | `/billing/estimate` | 费用估算 | 是 |

## 项目

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| GET | `/projects` | 项目列表 | 是 |
| POST | `/projects` | 创建项目 | 是 |
| GET | `/projects/:id` | 项目详情 | 是 |
| PUT | `/projects/:id` | 更新项目 | 是 |
| DELETE | `/projects/:id` | 删除项目 | 是 |

项目保存字段：

```json
{
  "name": "项目名称",
  "description": "描述",
  "canvas_data": {
    "nodes": [],
    "edges": [],
    "viewport": {}
  },
  "thumbnail_file_id": "uuid",
  "is_public": false
}
```

## 文件

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| POST | `/upload/image` | 上传图片，字段名 `file` | 是 |
| GET | `/files/:id` | 文件详情 | 是 |
| DELETE | `/files/:id` | 软删除文件 | 是 |
| GET | `/storage/*` | 访问 active 文件内容 | 表状态校验 |

## 公告

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| GET | `/announcements/latest` | 最新公告 | 否 |
| GET | `/announcements/:id` | 公告详情 | 否 |

## 管理端

管理端统一要求登录且用户角色为 `admin`。

| 路径前缀 | 说明 |
| --- | --- |
| `/admin/dashboard/*` | 仪表盘 |
| `/admin/users/*` | 用户管理 |
| `/admin/user-groups/*` | 用户组管理 |
| `/admin/coins/*` | 金币流水 |
| `/admin/models/*` | 模型管理 |
| `/admin/channels/*` | 渠道管理 |
| `/admin/billing/*` | 计费规则 |
| `/admin/records/*` | 生成记录 |
| `/admin/files/*` | 文件管理 |
| `/admin/error-logs/*` | 错误日志 |
| `/admin/announcements/*` | 公告管理 |

