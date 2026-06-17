# Tasks

> 按 `doc/server-design.md` 第十七章「分阶段实施建议」组织，共 8 个阶段。
> 每个阶段产出可独立验证的成果，阶段间存在依赖关系（见末尾「Task Dependencies」）。

## 阶段一：基础设施（认证体系）

- [x] Task 1: 搭建 Express 项目框架与配置基础设施
  - [x] SubTask 1.1: 创建 `server/` 目录结构（src/app.js、config/、middleware/、routes/、services/、utils/、adapters/、scheduler/）
  - [x] SubTask 1.2: 配置 package.json（express、sequelize、mysql2、redis、jsonwebtoken、bcryptjs、cors、multer、dayjs、uuid、nodemon）
  - [x] SubTask 1.3: 实现 `src/config/database.js`（Sequelize + MySQL 连接，utf8mb4）
  - [x] SubTask 1.4: 实现 `src/config/redis.js`（Redis 连接，支持密码认证）
  - [x] SubTask 1.5: 实现 `src/config/auth.js`（JWT 配置：Access 15min、Refresh 7d）
  - [x] SubTask 1.6: 创建 `.env.example` 与 `.env`（含全部环境变量，见设计文档 Step 7）
  - [x] SubTask 1.7: 实现 `src/app.js` Express 入口（CORS、JSON 解析、request_id 中间件、路由挂载、统一错误处理、统一响应格式）
  - [x] SubTask 1.8: 实现 `src/utils/logger.js`（日志工具，支持 LOG_LEVEL）
  - [x] SubTask 1.9: 实现 `src/utils/encryption.js`（AES-256-GCM 加解密，用于 API Key）
  - [x] SubTask 1.10: 实现 `src/utils/response.js`（统一响应封装：success/error/paginate，含 request_id）

- [x] Task 2: 实现认证相关数据库表与模型
  - [x] SubTask 2.1: 创建 `server/sql/init.sql`（全部建表 SQL，按设计文档第三/四/五/六/八/九/十章）
  - [x] SubTask 2.2: 实现 Sequelize 模型 `users`（含邮箱认证状态、风控字段、注册来源）
  - [x] SubTask 2.3: 实现 Sequelize 模型 `refresh_tokens`（外键关联 users）
  - [x] SubTask 2.4: 实现 Sequelize 模型 `email_verifications`（支持 register/reset_password/change_email/login 用途）
  - [x] SubTask 2.5: 实现 Sequelize 模型 `login_logs`（全量登录尝试记录，含 IP/UA 解析字段）

- [x] Task 3: 实现认证中间件与工具
  - [x] SubTask 3.1: 实现 `src/middleware/auth.js`（JWT 验证、userId 注入、Redis 黑名单检查、封禁状态检查）
  - [x] SubTask 3.2: 实现 `src/middleware/admin.js`（Admin 角色检查）
  - [x] SubTask 3.3: 实现 `src/middleware/rateLimit.js`（Redis 滑动窗口限流，全局 + 单接口可配）
  - [x] SubTask 3.4: 实现 `src/middleware/audit-context.js`（统一采集 IP/UA/地理位置，注入 req.auditContext）
  - [x] SubTask 3.5: 实现 `src/middleware/requestId.js`（生成/复用 request_id，注入 req 与响应头）
  - [x] SubTask 3.6: 实现 `src/utils/ip-ua.js`（IP 解析 MaxMind/ip2region、UA 解析 ua-parser-js）

- [x] Task 4: 实现用户认证服务与路由
  - [x] SubTask 4.1: 实现 `src/services/auth.js`（register/verifyEmail/login/logout/refresh/forgotPassword/resetPassword）
  - [x] SubTask 4.2: 实现 `src/services/email.js`（SMTP 发送验证码/重置邮件，60s 节流，限频 5次/小时）
  - [x] SubTask 4.3: 实现 `src/routes/auth.js`（15 个认证接口：register/verify-email/resend/check-email/login/logout/refresh/me/password/forgot/reset/change-email/sessions/login-logs）
  - [x] SubTask 4.4: 实现登录安全检查（IP 限频、账号失败锁定、状态检查、异地登录提醒）
  - [x] SubTask 4.5: 实现邮箱认证流程（验证码生成、bcrypt 存储、5 次尝试上限、24h 未认证清理）

- [ ] Task 5: 前端认证页面与路由守卫
  - [ ] SubTask 5.1: 新增 `src/utils/auth.js`（JWT Token 管理：存储/读取/清除/刷新）
  - [ ] SubTask 5.2: 修改 `src/utils/request.js`（移除 API Key，注入 JWT Authorization 头，401 自动刷新）
  - [ ] SubTask 5.3: 新增 `src/api/auth.js`（认证 API 封装）
  - [ ] SubTask 5.4: 新增 `src/stores/pinia/user.js`（用户状态：登录态/用户信息/余额）
  - [ ] SubTask 5.5: 新增 `src/views/Login.vue`（登录页面，邮箱/用户名 + 密码）
  - [ ] SubTask 5.6: 新增 `src/views/Register.vue`（注册页面，含邮箱验证码步骤）
  - [ ] SubTask 5.7: 修改 `src/router/index.js`（新增登录/注册路由 + 路由守卫，未登录跳转登录页）
  - [ ] SubTask 5.8: 修改 `src/components/AppHeader.vue`（新增用户头像、余额显示、退出登录）

## 阶段二：模型管理 + 多地址轮换

- [ ] Task 6: 模型调度数据库表与模型
  - [ ] SubTask 6.1: 实现 Sequelize 模型 `model_channels`（渠道地址池，AES 加密 api_key）
  - [ ] SubTask 6.2: 实现 Sequelize 模型 `models`（image/video/chat 三类独立）
  - [ ] SubTask 6.3: 实现 Sequelize 模型 `model_channel_bindings`（多对多 + 轮换配置）

- [ ] Task 7: 请求适配器（从前端 providers.js 迁移）
  - [ ] SubTask 7.1: 实现 `src/adapters/index.js`（适配器注册表，按 provider_type 分发）
  - [ ] SubTask 7.2: 实现 `src/adapters/openai.js`（标准 OpenAI 格式：chat/image/video）
  - [ ] SubTask 7.3: 实现 `src/adapters/aliyun.js`（阿里云万相格式：messages 嵌套、异步任务查询）
  - [ ] SubTask 7.4: 实现 `src/adapters/doubao.js`（豆包 Responses API 格式）
  - [ ] SubTask 7.5: 实现 `src/adapters/custom.js`（自定义格式，可扩展）

- [ ] Task 8: 轮换调度器与熔断器
  - [ ] SubTask 8.1: 实现 `src/scheduler/rotation.js`（4 种策略：round_robin/weighted_random/priority/failover，Redis 维护状态）
  - [ ] SubTask 8.2: 实现 `src/scheduler/circuit-breaker.js`（CLOSED/OPEN/半开状态机，连续失败 5 次熔断 60s）
  - [ ] SubTask 8.3: 实现 `src/scheduler/health-check.js`（渠道健康检查，定时探测）
  - [ ] SubTask 8.4: 实现 `src/scheduler/index.js`（调度入口：查模型→查渠道→过滤→选策略→发请求→失败重试）

- [ ] Task 9: 模型管理 API（管理侧 + 用户侧）
  - [ ] SubTask 9.1: 实现 `src/routes/admin/channels.js`（渠道 CRUD + 测试连通性 + 重置熔断器 + 统计）
  - [ ] SubTask 9.2: 实现 `src/routes/admin/models.js`（模型 CRUD + 启停 + 渠道绑定管理）
  - [ ] SubTask 9.3: 实现 `src/routes/models.js`（用户侧：GET /api/models、按类型查询、详情）

- [ ] Task 10: 生成 API 与对话 SSE 代理
  - [ ] SubTask 10.1: 实现 `src/services/image.js`（图片生成服务：调度→调用→下载结果→存本地→返回 URL）
  - [ ] SubTask 10.2: 实现 `src/services/video.js`（视频生成服务：异步任务提交 + 轮询查询）
  - [ ] SubTask 10.3: 实现 `src/services/chat.js`（对话服务：非流式 + SSE 流式代理，ReadableStream 转发）
  - [ ] SubTask 10.4: 实现 `src/routes/generate.js`（POST /api/generate/image、GET /api/generate/image/:taskId、视频同理）
  - [ ] SubTask 10.5: 实现 `src/routes/chat.js`（POST /api/chat/completions、POST /api/chat/completions/stream）

- [ ] Task 11: 前端 API 调用层改造
  - [ ] SubTask 11.1: 修改 `src/api/image.js`（调用后端 /api/generate/image，移除 provider 参数）
  - [ ] SubTask 11.2: 修改 `src/api/video.js`（调用后端 /api/generate/video，移除 provider 参数）
  - [ ] SubTask 11.3: 修改 `src/api/chat.js`（调用后端 SSE，移除 apiKey）
  - [ ] SubTask 11.4: 修改 `src/api/model.js`（从后端 /api/models 获取模型列表）
  - [ ] SubTask 11.5: 修改 `src/hooks/useApi.js`（移除 provider 获取，简化为纯参数）
  - [ ] SubTask 11.6: 修改 `src/config/providers.js`（迁移到后端，保留为适配器参考）
  - [ ] SubTask 11.7: 修改 `src/stores/pinia/models.js`（移除 API Key 配置，保留模型选择）

## 阶段三：服务端存储

- [ ] Task 12: 本地磁盘存储服务
  - [ ] SubTask 12.1: 实现 Sequelize 模型 `files`（含软删除字段 status/deleted_at/deleted_by/delete_reason）
  - [ ] SubTask 12.2: 实现 `src/services/storage.js`（写入本地磁盘按 yyyy/mm 分目录、生成访问 URL、缩略图生成、sha256 计算）
  - [ ] SubTask 12.3: 实现 `src/routes/upload.js`（POST /api/upload/image、GET /api/files/:id、DELETE /api/files/:id 软删除、GET /api/files/:id/stream 鉴权代理）
  - [ ] SubTask 12.4: 实现软删除规则（用户侧 WHERE status='active'、管理员可见全部、不可重复删除 409、物理文件 90 天后清理定时任务）
  - [ ] SubTask 12.5: 实现管理员文件管理 API（GET /api/admin/files 含已删除、POST /api/admin/files/:id/restore）

- [ ] Task 13: 前端存储改造
  - [ ] SubTask 13.1: 修改 `src/components/ImageNode.vue`（上传改为后端 API）
  - [ ] SubTask 13.2: 修改 `src/components/DownloadModal.vue`（下载改为本地存储 URL）
  - [ ] SubTask 13.3: 删除 `src/utils/imageCache.js`（IndexedDB 不再需要）
  - [ ] SubTask 13.4: 新增 `src/api/file.js`（文件上传 API 封装）

## 阶段四：金币额度与计费

- [ ] Task 14: 计费数据库表与模型
  - [ ] SubTask 14.1: 实现 Sequelize 模型 `billing_rules`（fixed/param_tiered，参数差异化定价）
  - [ ] SubTask 14.2: 实现 Sequelize 模型 `user_balances`（余额 + 冻结 + 累计统计 + 乐观锁 version）
  - [ ] SubTask 14.3: 实现 Sequelize 模型 `coin_transactions`（全量流水，15 种 type，含 balance_before/after）
  - [ ] SubTask 14.4: 实现 Sequelize 模型 `generation_records`（含 IP/UA、审核状态、用户组快照、coin_tx_id）
  - [ ] SubTask 14.5: 实现 Sequelize 模型 `system_settings`（KV 结构，支持 secret 加密）

- [ ] Task 15: CoinService 强一致金币服务
  - [ ] SubTask 15.1: 实现 `src/services/coin.js` 的 `transact()` 方法（事务 + FOR UPDATE 行锁 + 乐观锁 + 全量流水 + 审计 + 消息）
  - [ ] SubTask 15.2: 实现余额校验（direction=out 时 balance_before >= amount，不足抛 InsufficientBalance）
  - [ ] SubTask 15.3: 实现幂等键（防重复扣费）
  - [ ] SubTask 15.4: 实现冲正（rollback 反向流水，related_tx_id 指向原流水，置 is_reversed=1）
  - [ ] SubTask 15.5: 实现异步联动（更新 Redis 余额缓存 30s、发送站内消息）

- [ ] Task 16: 计费规则与额度检查
  - [ ] SubTask 16.1: 实现 `src/services/billing.js`（费用计算：模型原价 × cost_multiplier × 折扣）
  - [ ] SubTask 16.2: 实现用户组费率计算（取所有有效组中 cost_multiplier 最小值，黑名单覆盖）
  - [ ] SubTask 16.3: 实现配额检查（daily/monthly limit，命中返回 402 QUOTA_EXCEEDED）
  - [ ] SubTask 16.4: 实现预扣减 → 调用 API → 成功确认/失败退还流程（集成到生成服务）
  - [ ] SubTask 16.5: 实现对话类型按实际 token 用量微调（多退少补，差额走 adjust 流水）

- [ ] Task 17: 计费 API 与对账
  - [ ] SubTask 17.1: 实现用户侧 API（GET /api/coins/balance、/api/coins/transactions、/api/coins/summary、/api/billing/estimate）
  - [ ] SubTask 17.2: 实现管理侧 API（计费规则 CRUD、用户充值/赠送/调整、全站流水、对账报告、消费统计、模型使用统计、数据导出）
  - [ ] SubTask 17.3: 实现每日对账定时任务（理论余额 vs 实际余额，异常告警）
  - [ ] SubTask 17.4: 实现系统设置 API（GET/PUT /api/admin/settings，secret 项脱敏返回）

- [ ] Task 18: 前端计费展示
  - [ ] SubTask 18.1: 新增 `src/api/billing.js`（额度/计费 API 封装）
  - [ ] SubTask 18.2: 新增 `src/views/account/Balance.vue`（余额与消费记录页面）
  - [ ] SubTask 18.3: 修改 `src/components/ApiSettings.vue`（改造为用户中心/额度展示）
  - [ ] SubTask 18.4: 实现费用预估展示（生成前调用 /api/billing/estimate）

## 阶段五：账号控制与风控

- [ ] Task 19: 账号控制数据库表与模型
  - [ ] SubTask 19.1: 实现 Sequelize 模型 `user_groups`（计费分组，折扣/赠送/费率/配额）
  - [ ] SubTask 19.2: 实现 Sequelize 模型 `user_group_members`（多对多，含有效期）
  - [ ] SubTask 19.3: 实现 Sequelize 模型 `user_bans`（封禁/解封/冻结流水）
  - [ ] SubTask 19.4: 实现 Sequelize 模型 `recharge_orders`（充值订单）
  - [ ] SubTask 19.5: 实现 Sequelize 模型 `redeem_cards`（卡密，bcrypt 存储 hash）

- [ ] Task 20: 风控与内容审核数据库表
  - [ ] SubTask 20.1: 实现 Sequelize 模型 `content_review`（自动 + 人工审核）
  - [ ] SubTask 20.2: 实现 Sequelize 模型 `content_reports`（用户举报）
  - [ ] SubTask 20.3: 实现 Sequelize 模型 `risk_rules`（频次/阈值/模式/复合规则）
  - [ ] SubTask 20.4: 实现 Sequelize 模型 `risk_events`（风控事件）
  - [ ] SubTask 20.5: 实现 Sequelize 模型 `audit_logs`（管理员 + 敏感用户操作，只增不删）
  - [ ] SubTask 20.6: 实现 Sequelize 模型 `access_logs`（关键 API 调用，含 request_id）

- [ ] Task 21: 账号控制服务与 API
  - [ ] SubTask 21.1: 实现 `src/services/user-group.js`（用户组 CRUD、用户加组/移组、费率计算）
  - [ ] SubTask 21.2: 实现 `src/services/ban.js`（封禁/解封流程：更新状态、冻结/解冻金币、撤销 token、Redis 封禁名单、审计、消息）
  - [ ] SubTask 21.3: 实现 `src/services/recharge.js`（卡密兑换、管理员充值/赠送、订单管理）
  - [ ] SubTask 21.4: 实现 `src/services/appeal.js`（用户申诉提交、管理员处理）
  - [ ] SubTask 21.5: 实现账号控制 API 路由（用户组、封禁、充值、卡密、申诉）

- [ ] Task 22: 风控引擎与内容审核
  - [ ] SubTask 22.1: 实现 `src/services/risk.js`（风控中间件：采集维度、Redis 滑动窗口计算、规则匹配、执行动作）
  - [ ] SubTask 22.2: 实现内置风控规则（8 条：rate.generate.ip/user、daily.limit.user、burst.recharge、multi.account、content.violation.repeat、login.fail.burst、balance.abuse）
  - [ ] SubTask 22.3: 实现 `src/services/content-review.js`（自动审核接入阿里云绿网、人工复审队列、批量审核、隐藏/删除/还原）
  - [ ] SubTask 22.4: 实现 `src/services/audit.js`（AuditService.log()，路由中间件自动包裹 + Service 内部调用）
  - [ ] SubTask 22.5: 实现风控与审核 API 路由（规则 CRUD、事件列表、IP 黑名单、审核队列、举报处理）

## 阶段六：公告与站内消息

- [ ] Task 23: 公告与消息数据库表
  - [ ] SubTask 23.1: 实现 Sequelize 模型 `announcements`（banner/popup/list，定向投放）
  - [ ] SubTask 23.2: 实现 Sequelize 模型 `announcement_reads`（已读/确认关系）
  - [ ] SubTask 23.3: 实现 Sequelize 模型 `messages`（站内消息，事件驱动）
  - [ ] SubTask 23.4: 实现 Sequelize 模型 `message_broadcasts`（群发批次）

- [ ] Task 24: 公告与消息服务
  - [ ] SubTask 24.1: 实现 `src/services/announcement.js`（公告投放、scope 过滤、已读确认、未读计数）
  - [ ] SubTask 24.2: 实现 `src/services/message.js`（MessageService.notify() 事件驱动、群发批次异步分发）
  - [ ] SubTask 24.3: 实现 WebSocket 实时推送（message.new 事件、未读小红点）
  - [ ] SubTask 24.4: 实现公告与消息 API 路由（用户侧 + 管理侧）

## 阶段七：管理后台前端

- [ ] Task 25: 管理后台框架与仪表盘
  - [ ] SubTask 25.1: 新增 `src/views/admin/` 目录与布局组件（侧边栏导航）
  - [ ] SubTask 25.2: 新增 `src/views/admin/index.vue`（仪表盘：今日概况、7 日趋势、模型使用占比）
  - [ ] SubTask 25.3: 实现管理后台路由与 Admin 路由守卫

- [ ] Task 26: 管理后台业务页面
  - [ ] SubTask 26.1: 用户管理页面（列表/详情/充值/赠送/封禁/用户组）
  - [ ] SubTask 26.2: 模型管理页面（三 Tab + 多地址轮换配置 + 渠道地址池）
  - [ ] SubTask 26.3: 计费规则管理页面
  - [ ] SubTask 26.4: 风控中心页面（规则配置/事件处理/IP 黑名单/大盘）
  - [ ] SubTask 26.5: 内容审核队列 + 举报处理页面
  - [ ] SubTask 26.6: 公告编辑器 + 群发批次进度页面
  - [ ] SubTask 26.7: 审计日志/访问日志/金币流水查询页面（多维筛选 + 导出）
  - [ ] SubTask 26.8: 系统设置页面

## 阶段八：项目持久化与数据迁移

- [ ] Task 27: 项目持久化
  - [ ] SubTask 27.1: 实现 Sequelize 模型 `projects`（canvas_data JSON）
  - [ ] SubTask 27.2: 实现 `src/routes/projects.js`（项目 CRUD）
  - [ ] SubTask 27.3: 修改 `src/stores/projects.js`（改为后端 API 存储）
  - [ ] SubTask 27.4: 新增 `src/api/project.js`（项目 CRUD API 封装）

- [ ] Task 28: localStorage 数据迁移
  - [ ] SubTask 28.1: 实现 Sequelize 模型 `migrate_imports`（防重复导入）
  - [ ] SubTask 28.2: 实现迁移 API（POST /api/migrate/local、GET /api/migrate/status、DELETE /api/migrate/local-cache）
  - [ ] SubTask 28.3: 实现迁移处理流程（client_id 查重、data:image 转存、第三方 URL 下载转存、IndexedDB 回填）
  - [ ] SubTask 28.4: 前端实现一键迁移入口与进度展示

## 阶段九：部署与运维

- [ ] Task 29: 部署配置
  - [ ] SubTask 29.1: 创建 `server/ecosystem.config.js`（PM2 配置）
  - [ ] SubTask 29.2: 完善 `nginx.conf`（API 反向代理 + SSE 支持 + 静态资源缓存 + 安全头 + /storage/ 静态映射）
  - [ ] SubTask 29.3: 创建 `server/sql/init.sql` 完整版（全部建表 + 预置 system_settings + 默认用户组）
  - [ ] SubTask 29.4: 编写部署文档（宝塔面板安装步骤、环境变量配置、PM2 启动）

# Task Dependencies

- Task 2（认证表）depends on Task 1（框架）
- Task 3（中间件）depends on Task 1
- Task 4（认证服务）depends on Task 2, Task 3
- Task 5（前端认证）depends on Task 4
- Task 6（模型表）depends on Task 1
- Task 7（适配器）depends on Task 1
- Task 8（调度器）depends on Task 6, Task 7
- Task 9（模型 API）depends on Task 6, Task 8
- Task 10（生成 API）depends on Task 8, Task 12（存储）
- Task 11（前端 API 改造）depends on Task 9, Task 10
- Task 12（存储）depends on Task 1
- Task 13（前端存储）depends on Task 12
- Task 14（计费表）depends on Task 1
- Task 15（CoinService）depends on Task 14
- Task 16（计费规则）depends on Task 15, Task 19（用户组）
- Task 17（计费 API）depends on Task 15, Task 16
- Task 18（前端计费）depends on Task 17
- Task 19（账号控制表）depends on Task 1
- Task 20（风控审核表）depends on Task 1
- Task 21（账号控制服务）depends on Task 19, Task 15
- Task 22（风控审核服务）depends on Task 20, Task 15
- Task 23（公告消息表）depends on Task 1
- Task 24（公告消息服务）depends on Task 23
- Task 25（管理后台框架）depends on Task 5（前端认证）
- Task 26（管理后台页面）depends on Task 25, 及对应后端 API
- Task 27（项目持久化）depends on Task 1
- Task 28（数据迁移）depends on Task 27, Task 12
- Task 29（部署）depends on 所有功能 Task

# Parallelizable Work

以下 Task 可并行开发：
- Task 1 完成后：Task 6、Task 12、Task 14、Task 19、Task 20、Task 23、Task 27 可并行
- Task 7（适配器）与 Task 8（调度器）可并行（均依赖 Task 1）
- 前端 Task 5、Task 11、Task 13、Task 18 可在后端对应 API 就绪后并行
- 管理后台 Task 26 各页面可并行（依赖 Task 25 框架）
