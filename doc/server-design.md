# Doodle-Canvas 服务端架构

> 更新时间：2026-06-20
> 状态：当前实现说明
> 适用范围：后端 API、数据库、模型渠道、计费、文件存储、部署

## 架构总览

Doodle-Canvas 已从早期纯前端调用第三方 API 的形态，演进为“前端画布 + 后端代理 + 管理后台配置”的架构。

```text
浏览器
  Vue 3 / Vue Flow / Naive UI
  登录、项目列表、画布、管理后台
        |
        | 同源 HTTP / SSE
        v
Express 后端
  鉴权、限流、模型调度、生成代理、计费、文件存储、错误日志
        |
        +-- MySQL：用户、模型、渠道、计费、项目、记录、文件
        +-- Redis：限流、轮询计数、Token 黑名单、视频任务元数据
        +-- 本地磁盘：上传文件、生成图片、生成视频
        +-- 第三方模型服务：OpenAI 兼容、阿里云、豆包、阶跃星辰、Agnes、自定义
```

前端只访问本项目 `/api`，不再保存或发送第三方 API Key。

## 运行入口

- `server/src/app.js`：Express 入口。
- `/api/health`：健康检查。
- `/api/*`：业务接口，挂全局 API 限流。
- `/storage/*`：文件访问入口，先查 `files` 表状态，再 `sendFile`。
- 前端静态托管：当 `SERVE_FRONTEND !== false` 且 `dist/index.html` 存在时启用。

关键环境变量：

| 变量 | 说明 |
| --- | --- |
| `PORT` | 后端端口，默认 `3000` |
| `NODE_ENV` | `development` 或 `production` |
| `SERVE_FRONTEND` | 是否由后端托管前端，默认开启 |
| `FRONTEND_BASE` | 前端挂载路径，默认 `/` |
| `FRONTEND_DIST_DIR` | 前端构建目录，默认 `../../dist` |
| `CORS_ORIGINS` | 跨域白名单 |
| `RATE_LIMIT_GLOBAL` | API 全局限流，默认 `600/min` |

## 数据库模型

当前 `server/sql/init.sql` 覆盖 18 张核心表：

| 模块 | 表 |
| --- | --- |
| 用户认证 | `users`、`refresh_tokens`、`email_verifications`、`login_logs` |
| 用户组与金币 | `user_groups`、`user_group_members`、`user_balances`、`coin_transactions` |
| 模型渠道 | `models`、`model_channels`、`model_channel_bindings` |
| 计费 | `billing_rules` |
| 生成记录 | `generation_records` |
| 文件存储 | `files` |
| 项目 | `projects`、`migrate_imports` |
| 系统 | `system_settings`、`error_logs` |

`users.user_group_id` 仅用于主组展示；计费折扣以 `user_group_members` 中有效成员关系为准。

## 认证与安全

- 密码使用 bcrypt。
- Access Token 和 Refresh Token 都带 `token_type`，业务接口只接受 `access`。
- Refresh Token 哈希落库，可撤销。
- Redis 用于 Token 黑名单；生产环境 Redis 鉴权降级建议 `AUTH_REDIS_FAILURE_MODE=deny`。
- `request_id` 中间件为每次请求生成链路 ID。
- `auditContext` 中间件采集 IP、UA、设备信息，写入生成记录、金币流水和错误日志。
- Helmet 开启基本安全头。
- `/api` 使用全局限流，静态资源不计入限流。

开发环境缺少 `JWT_SECRET` / `AES_SECRET_KEY` 时会写入 `server/.runtime.env`；生产环境建议手动配置强密钥。

## 模型、渠道与调度

后台按三类模型管理：

- `chat`：问答/提示词润色/意图分析。
- `image`：文生图、图生图、多图参考。
- `video`：文生视频、图生视频、异步任务查询。

核心表关系：

```text
models
  1..n model_channel_bindings n..1
model_channels
```

约束：

- 模型和渠道必须同类型才能绑定。
- 用户侧只返回启用模型、启用渠道、启用绑定、未熔断渠道。
- 模型或渠道已有历史生成记录时，删除会改为解绑并停用，保留审计追溯。
- API Key 使用 AES-GCM 加密存储，接口只返回 `apiKeyConfigured` 和 `apiKeyValid`。

调度策略：

| 策略 | 行为 |
| --- | --- |
| `round_robin` | Redis 计数轮询，失败时本地随机 |
| `weighted_random` | 按绑定权重随机 |
| `priority` | 按渠道优先级 |
| `failover` | 当前与优先级逻辑一致，保留故障转移语义 |

支持 Provider：

| Provider | 说明 |
| --- | --- |
| `openai` | OpenAI 兼容 chat/image/video |
| `aliyun` | DashScope / 百炼图片、视频 |
| `doubao` | Ark Responses 与图片生成 |
| `stepfun` | StepFun chat/image |
| `agnes` | Agnes chat/image/video |
| `custom` | 自定义兼容接口 |

## 生成流程

图片生成：

1. 校验用户登录和请求参数。
2. 查找启用模型和可用渠道。
3. 创建 `generation_records`，状态为 `processing`。
4. 预估并扣除金币。
5. 按 Provider 适配请求并调用上游。
6. 解析图片结果；异步图片任务会轮询查询。
7. 转存图片到本地存储，写入 `files`。
8. 更新生成记录为 `completed`。
9. 失败时标记 `failed` 并退款。

视频生成：

- 上游直接返回 URL 时，立即转存并完成记录。
- 上游返回任务 ID 时，将任务元数据写入 Redis，用户通过 `/api/generate/video/:taskId` 查询。
- 查询到完成后转存视频、更新记录；失败则退款。

流式问答：

- 使用 SSE 代理上游流。
- 生成记录在流结束后标记完成。
- 发生错误时记录后台错误日志，前端只收到友好错误文案。

## 计费

计费服务位于 `server/src/services/billing.js`：

- `GET /api/billing/estimate`：用户侧费用预估。
- 后台 `/api/admin/billing/rules`：计费规则 CRUD。
- 生成前预扣，失败自动退款。
- 金币流水统一写入 `coin_transactions`。
- 图片模型最低 1 金币兜底，避免误设免费。
- 并发扣费使用 MySQL 用户级锁降低超扣风险。

`coin_transactions.metadata` 会记录项目、模型、提示词等上下文，方便后台金币流水追溯。

## 文件存储

文件服务位于 `server/src/services/storage.js`。

存储类型：

- `upload`：用户上传参考图。
- `generated_image`：生成图片。
- `generated_video`：生成视频。
- `thumbnail`：预留缩略图。

安全规则：

- 上传只接受 PNG/JPEG/WebP/GIF。
- 视频转存只接受 MP4/WebM。
- 通过魔数识别真实 MIME，不信任请求头。
- 远程 URL 只允许 HTTP/HTTPS，不允许 URL 认证信息。
- DNS 校验和实际连接 lookup 都阻断内网、回环、链路本地、组播等地址。
- 文件访问必须在 `files` 表中为 `active`。
- 用户删除是软删除，管理员可恢复。

## 项目持久化

项目服务位于 `server/src/services/project.js`：

- 用户项目存储在 `projects.canvas_data`。
- 画布保存前会清理浏览器本地大对象和临时 URL。
- 生成请求可携带 `project_id`，服务端只接受当前用户拥有的项目 ID。
- 后台文件、记录、金币流水会回填项目上下文。

## API 路由

用户侧：

- `/api/auth/*`
- `/api/models/*`
- `/api/generate/*`
- `/api/chat/*`
- `/api/coins/*`
- `/api/billing/*`
- `/api/records/*`
- `/api/projects/*`
- `/api/upload/image`
- `/api/files/*`

管理侧：

- `/api/admin/dashboard/*`
- `/api/admin/users/*`
- `/api/admin/user-groups/*`
- `/api/admin/coins/*`
- `/api/admin/channels/*`
- `/api/admin/models/*`
- `/api/admin/billing/*`
- `/api/admin/records/*`
- `/api/admin/files/*`
- `/api/admin/error-logs/*`

## 已知未完成模块

以下模块仍未落地，详见 [missing-features.md](./missing-features.md)：

- 充值订单与卡密兑换。
- 内容审核、举报、风控规则、封禁流水。
- 公告与站内消息。
- 审计日志和访问日志完整落库。
- 用户中心拆分页。
- 数据迁移 API `/api/migrate/*`。
