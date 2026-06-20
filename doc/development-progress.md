# Doodle-Canvas 开发进度记录

> 更新时间：2026-06-20
> 当前重点：后端化模型调用、云端项目、文件存储、计费和后台核心管理能力已完成；后续进入商业化、治理和用户中心阶段。

## 当前架构状态

- 前端：Vue 3 + Vite + Vue Flow，根路径 `/` 是项目官网，登录后默认进入 `/projects`。
- 后端：Express 单服务，提供 `/api`、`/storage` 和前端静态托管。
- 数据库：MySQL + Sequelize，`server/sql/init.sql` 是当前合并版初始化脚本。
- 缓存：Redis 用于限流、轮询计数、Token 黑名单和视频任务元数据。
- 文件：本地磁盘存储，访问前校验 `files` 表状态。

## 已完成能力

### 账号与权限

- 注册、登录、退出、刷新 Token、会话列表和撤销。
- Access/Refresh Token 带 `token_type`，防止 Refresh Token 被当作业务 Token 使用。
- 管理后台路由要求登录和 admin 角色。
- `/auth/me` 返回用户资料、余额和用户组。

### 模型与渠道

- 按 `chat`、`image`、`video` 三类配置模型和渠道。
- 支持 OpenAI 兼容、阿里云、豆包、阶跃星辰、Agnes、自定义 Provider。
- API Key 加密存储，管理端仅展示密钥配置状态。
- 同一模型可绑定多条同类型渠道，支持轮询、加权随机、优先级和故障转移策略字段。
- 用户侧 `/api/models` 只返回可用公开模型。
- 删除已有历史生成记录的模型或渠道时改为停用，保留追溯关系。

### 生成、计费与记录

- 图片、视频、非流式问答、流式问答都走后端代理。
- 生成记录以 `processing` 开始，成功为 `completed`，失败为 `failed`。
- 生成前扣费，失败退款。
- 图片模型最低 1 金币兜底。
- 金币流水包含项目、模型、提示词等上下文。
- 管理后台可查生成记录和金币流水。

### 文件与项目

- 用户上传参考图走 `/api/upload/image`。
- 生成图片和视频转存到本地 `STORAGE_ROOT`，写入 `files` 表。
- `/storage/*` 只允许访问 active 文件。
- 文件软删除和管理员恢复已实现。
- 项目列表、创建、读取、更新、删除已接入后端。
- 画布自动保存节点、边和视口，清理本地大对象后再写服务端。
- 生成记录、文件和金币流水可关联项目。

### 安全与稳定性

- Helmet、CORS、全局 API 限流。
- Redis 异常限流降级，生产鉴权可配置 fail closed。
- 远程文件转存阻断内网、回环、链路本地、组播地址。
- 转存文件使用魔数识别真实 MIME。
- 上游错误和客户端断连写入 `error_logs`。
- 前端只展示友好错误，后台保留原始错误、堆栈和上游响应。

### 管理后台

已落地页面：

- `/admin/dashboard`
- `/admin/users`
- `/admin/user-groups`
- `/admin/coins`
- `/admin/records`
- `/admin/files`
- `/admin/error-logs`
- `/admin/models/chat`
- `/admin/models/image`
- `/admin/models/video`

旧 `/admin/channels` 和 `/admin/billing` 已跳转到 `/admin/models/chat`，避免多套配置入口。

## 验证记录摘要

历史已执行并通过的检查包括：

- `git diff --check`
- 多个后端关键文件 `node --check`
- 后端路由模块导入检查
- `npm run build`
- 生产依赖审计，官方 registry 下根项目与 `server` 均为 0 vulnerabilities
- 认证、后台页面、模型公开列表、项目 CRUD、文件软删除、SSRF 负向、超时日志、429 限流等回归

最近一次文档更新只改 Markdown，未重新运行构建。

## 当前剩余工作

详见 [missing-features.md](./missing-features.md)。摘要如下：

- 充值订单与卡密兑换。
- 审计日志、访问日志、对账报告。
- 内容审核、举报、风控、封禁流水、申诉。
- 公告与站内消息。
- 用户中心拆分页。
- localStorage 迁移 API。
- 文件物理清理和渠道自动熔断恢复增强。

## 下一步建议

1. 先做充值订单和卡密，补齐收入链路。
2. 同步做审计日志，确保管理员操作可追踪。
3. 再做内容审核、举报和风控，降低开放使用后的治理风险。
4. 最后补公告、站内消息和用户中心体验。
