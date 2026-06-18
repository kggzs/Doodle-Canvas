# Doodle-Canvas 未完善功能清单

> 基于 `server-design.md`（v3.2）与当前代码实现对比生成
> 日期：2026-06-18
> 说明：仅列出设计中定义但尚未实现或部分实现的功能

---

## 一、缺失的数据库表（共 19 张未创建）

以下表在 `server-design.md` 中定义，但 `server/sql/init.sql` 中未包含，且无对应 Model：

| # | 表名 | 用途 | 所属模块 |
|---|------|------|----------|
| 1 | `user_bans` | 封禁记录表（每次封禁/解封一条流水） | 账号控制/风控 |
| 2 | `recharge_orders` | 充值订单表（卡密/兑换码/在线支付） | 金币/充值 |
| 3 | `redeem_cards` | 兑换卡密表（批量生成/一码一用） | 金币/充值 |
| 4 | `audit_logs` | 审计日志表（管理员操作全量记录） | 审计 |
| 5 | `access_logs` | 访问日志表（关键 API 调用记录） | 审计 |
| 6 | `content_review` | 内容审核表（AI 生成内容复审） | 内容审核 |
| 7 | `content_reports` | 内容举报表（用户举报记录） | 内容审核 |
| 8 | `risk_rules` | 风控规则表（可配置触发条件） | 风控 |
| 9 | `risk_events` | 风控事件表（每次命中规则记录） | 风控 |
| 10 | `announcements` | 公告表（全站/定向/弹窗） | 公告消息 |
| 11 | `announcement_reads` | 公告已读关系表 | 公告消息 |
| 12 | `messages` | 站内消息表（一对一通知） | 公告消息 |
| 13 | `message_broadcasts` | 群发批次表 | 公告消息 |
| 14 | `files` | 文件表（软删除可溯源） | 文件存储 |
| 15 | `generation_records` | 生成记录表（含审核状态/费率快照） | 生成/计费 |
| 16 | `billing_rules` | 计费规则表（按模型固定/参数差异化） | 计费 |
| 17 | `projects` | 项目表（画布持久化） | 项目 |
| 18 | `system_settings` | 系统设置表 | 系统 |
| 19 | `migrate_imports` | 迁移导入映射表（防重复） | 数据迁移 |

**当前 `init.sql` 已有的表**：users, refresh_tokens, email_verifications, login_logs, model_channels, models, model_channel_bindings, user_groups, user_group_members, user_balances, coin_transactions

---

## 二、缺失的后端路由（共 40+ 个接口）

### 2.1 用户侧接口（12 个）

| # | 方法 | 路径 | 说明 | 原因 |
|---|------|------|------|------|
| 1 | GET | `/api/coins/balance` | 查询金币余额（含冻结） | 无对应路由文件 |
| 2 | GET | `/api/coins/summary` | 收支汇总（充值/消费/赠送/退还统计） | 无对应路由文件 |
| 3 | GET | `/api/billing/estimate` | 预估本次费用（含用户组折扣） | 无对应路由文件 |
| 4 | GET | `/api/records` | 我的生成记录（含审核状态） | 无对应路由文件 |
| 5 | GET | `/api/recharge/orders` | 我的充值订单 | 无对应路由文件 |
| 6 | POST | `/api/recharge/redeem` | 兑换卡密 | 无对应路由文件 |
| 7 | GET | `/api/user-groups/my` | 我的用户组与权益 | 无对应路由文件 |
| 8 | GET | `/api/announcements` | 可见公告列表（分 banner/popup/list） | 无对应路由文件 |
| 9 | GET/POST | `/api/announcements/:id` /read /confirm | 公告详情/已读/确认 | 无对应路由文件 |
| 10 | GET/PUT/DELETE | `/api/messages/*` | 站内消息全部接口（6 个） | 无对应路由文件 |
| 11 | POST | `/api/reports` | 举报内容 | 无对应路由文件 |
| 12 | POST | `/api/appeals` | 用户提交封禁申诉 | 无对应路由文件 |

### 2.2 管理侧缺失路由（按模块分组）

#### 仪表盘（3 个）
| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 1 | GET | `/api/admin/dashboard/overview` | 今日概况 |
| 2 | GET | `/api/admin/dashboard/trend` | 趋势数据 |
| 3 | GET | `/api/admin/dashboard/model-stats` | 模型使用统计 |

#### 用户管理（5 个）
| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 4 | GET | `/api/admin/users/:id/generations` | 用户全部生成内容 |
| 5 | POST | `/api/admin/users/:id/freeze-coins` | 冻结金币 |
| 6 | POST | `/api/admin/users/:id/unfreeze-coins` | 解冻金币 |
| 7 | GET | `/api/admin/users/:id/bans` | 封禁历史 |

#### 充值与卡密（4 个）
| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 8 | GET | `/api/admin/recharge/orders` | 全部充值订单 |
| 9 | POST | `/api/admin/redeem-cards/batch` | 批量生成卡密 |
| 10 | GET | `/api/admin/redeem-cards` | 卡密列表 |
| 11 | PUT | `/api/admin/redeem-cards/:id` | 禁用/续期卡密 |

#### 金币与审计（4 个）
| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 12 | GET | `/api/admin/coins/reconciliation` | 对账报告 |
| 13 | GET | `/api/admin/audit-logs` | 审计日志 |
| 14 | GET | `/api/admin/access-logs` | 访问日志 |
| 15 | GET | `/api/admin/login-logs` | 全站登录日志 |

#### 内容审核与举报（6 个）
| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 16 | GET | `/api/admin/review/queue` | 待审核内容队列 |
| 17 | GET | `/api/admin/review/list` | 审核内容列表 |
| 18 | PUT | `/api/admin/review/:id` | 提交复审结果 |
| 19 | POST | `/api/admin/review/batch` | 批量审核 |
| 20 | GET | `/api/admin/reports` | 举报列表 |
| 21 | PUT | `/api/admin/reports/:id` | 处理举报 |

#### 风控中心（7 个）
| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 22 | GET | `/api/admin/risk/rules` | 风控规则列表 |
| 23 | POST | `/api/admin/risk/rules` | 创建规则 |
| 24 | PUT | `/api/admin/risk/rules/:id` | 更新规则 |
| 25 | GET | `/api/admin/risk/events` | 风控事件列表 |
| 26 | GET | `/api/admin/risk/dashboard` | 风控大盘 |
| 27 | POST | `/api/admin/risk/events/:id/handle` | 处理风控事件 |
| 28 | GET/POST | `/api/admin/risk/blacklist/ip` | IP 黑名单 |

#### 申诉管理（3 个）
| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 29 | GET | `/api/admin/appeals` | 申诉列表 |
| 30 | PUT | `/api/admin/appeals/:id` | 处理申诉 |

#### 公告管理（6 个）
| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 31 | GET | `/api/admin/announcements` | 公告列表 |
| 32 | POST | `/api/admin/announcements` | 创建公告 |
| 33 | PUT | `/api/admin/announcements/:id` | 更新公告 |
| 34 | DELETE | `/api/admin/announcements/:id` | 删除公告 |
| 35 | PUT | `/api/admin/announcements/:id/status` | 上线/下线 |
| 36 | GET | `/api/admin/announcements/:id/stats` | 阅读统计 |

#### 站内消息（4 个）
| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 37 | POST | `/api/admin/messages/broadcast` | 群发消息 |
| 38 | GET | `/api/admin/messages/broadcasts` | 群发批次 |
| 39 | GET | `/api/admin/messages/broadcasts/:id` | 批次详情 |
| 40 | POST | `/api/admin/messages/send` | 单发消息 |

#### 计费管理（4 个）
| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 41 | GET/POST | `/api/admin/billing/rules` | 计费规则 CRUD |
| 42 | PUT/DELETE | `/api/admin/billing/rules/:id` | 计费规则 CRUD |

#### 记录与报表（4 个）
| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 43 | GET | `/api/admin/records` | 生成记录列表 |
| 44 | GET | `/api/admin/records/:id` | 记录详情 |
| 45 | GET | `/api/admin/reports/consumption` | 消费统计 |
| 46 | GET | `/api/admin/reports/model-usage` | 模型统计 |
| 47 | GET | `/api/admin/reports/export` | 数据导出 |

#### 系统设置（2 个）
| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 48 | GET/PUT | `/api/admin/settings` | 系统设置 |

#### 文件管理（2 个）
| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 49 | GET | `/api/admin/files` | 文件列表（含已删除） |
| 50 | POST | `/api/admin/files/:id/restore` | 恢复软删除文件 |

#### 渠道高级（3 个）
| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 51 | POST | `/api/admin/channels/:id/test` | 测试连通性 |
| 52 | POST | `/api/admin/channels/:id/reset-circuit` | 重置熔断器 |
| 53 | GET | `/api/admin/channels/:id/stats` | 渠道统计 |

#### 模型高级（4 个）
| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 54 | PUT | `/api/admin/models/:id/status` | 启用/禁用模型 |
| 55 | GET | `/api/admin/models/:id/channels` | 模型绑定地址列表 |
| 56 | POST | `/api/admin/models/:id/channels` | 添加地址到模型 |
| 57 | PUT/DELETE | `/api/admin/models/:id/channels/:bindingId` | 修改/移除绑定 |

#### 项目与迁移（6 个）
| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 58 | GET/POST | `/api/projects` | 项目 CRUD |
| 59 | GET/PUT/DELETE | `/api/projects/:id` | 项目 CRUD |
| 60 | POST | `/api/upload/image` | 上传参考图片 |
| 61 | GET | `/api/files/:id` | 获取文件信息 |
| 62 | DELETE | `/api/files/:id` | 删除文件（软删除） |
| 63 | POST/GET/DELETE | `/api/migrate/*` | 数据迁移接口 |

---

## 三、缺失的后端服务（共 8 个）

| # | 服务文件 | 说明 | 优先级 |
|---|----------|------|--------|
| 1 | `server/src/services/storage.js` | 本地文件存储服务（上传/下载/软删除/缩略图） | 高 |
| 2 | `server/src/services/billing.js` | 计费服务（扣费/退款/费率计算/配额检查） | 高 |
| 3 | `server/src/services/message.js` | 消息服务（站内消息通知/群发/已读） | 中 |
| 4 | `server/src/services/announcement.js` | 公告服务（投放/定向/已读） | 中 |
| 5 | `server/src/services/review.js` | 内容审核服务（自动/人工审核） | 中 |
| 6 | `server/src/services/risk.js` | 风控服务（规则引擎/事件/封禁联动） | 中 |
| 7 | `server/src/services/recharge.js` | 充值服务（卡密/订单） | 中 |
| 8 | `server/src/services/project.js` | 项目持久化服务 | 低 |

---

## 四、缺失的适配器（共 3 个）

`server-design.md` 定义 4 种适配器，当前仅存在 `adapters/index.js`：

| # | 文件 | 说明 |
|---|------|------|
| 1 | `server/src/adapters/openai.js` | OpenAI 标准格式适配器 |
| 2 | `server/src/adapters/aliyun.js` | 阿里云万相适配器 |
| 3 | `server/src/adapters/doubao.js` | 豆包适配器 |

> `adapters/index.js` 仅含注册入口，无具体实现。

---

## 五、缺失的调度器（共 3 个）

当前仅存在 `scheduler/index.js`：

| # | 文件 | 说明 |
|---|------|------|
| 1 | `server/src/scheduler/rotation.js` | 轮换策略（round_robin/weighted/priority/failover） |
| 2 | `server/src/scheduler/circuit-breaker.js` | 熔断器（故障自动切换） |
| 3 | `server/src/scheduler/health-check.js` | 渠道健康检查（定时任务） |

---

## 六、缺失的 Model 文件（共 12 个）

需要创建以下 Sequelize Model：

| # | 文件 | 对应表 |
|---|------|--------|
| 1 | `server/src/models/UserBan.js` | user_bans |
| 2 | `server/src/models/RechargeOrder.js` | recharge_orders |
| 3 | `server/src/models/RedeemCard.js` | redeem_cards |
| 4 | `server/src/models/AuditLog.js` | audit_logs |
| 5 | `server/src/models/AccessLog.js` | access_logs |
| 6 | `server/src/models/ContentReview.js` | content_review |
| 7 | `server/src/models/ContentReport.js` | content_reports |
| 8 | `server/src/models/RiskRule.js` | risk_rules |
| 9 | `server/src/models/RiskEvent.js` | risk_events |
| 10 | `server/src/models/Announcement.js` | announcements |
| 11 | `server/src/models/AnnouncementRead.js` | announcement_reads |
| 12 | `server/src/models/Message.js` | messages |
| 13 | `server/src/models/MessageBroadcast.js` | message_broadcasts |
| 14 | `server/src/models/File.js` | files |
| 15 | `server/src/models/GenerationRecord.js` | generation_records |
| 16 | `server/src/models/BillingRule.js` | billing_rules |
| 17 | `server/src/models/Project.js` | projects |
| 18 | `server/src/models/SystemSetting.js` | system_settings |
| 19 | `server/src/models/MigrateImport.js` | migrate_imports |

Model 关联关系也需同步更新到 `server/src/models/index.js`。

---

## 七、缺失的前端管理页面（共 12 个页面）

当前已有管理页面：AdminUsers, AdminCoins, AdminUserGroups, AdminChannels, AdminModels

| # | 页面路径 | 说明 | 优先级 |
|---|----------|------|--------|
| 1 | `src/views/AdminDashboard.vue` | 仪表盘（今日概况/趋势图/模型占比） | 高 |
| 2 | `src/views/AdminRecords.vue` | 生成记录（多维筛选/详情） | 高 |
| 3 | `src/views/AdminBilling.vue` | 计费规则管理（按模型定价） | 高 |
| 4 | `src/views/AdminReview.vue` | 内容审核队列（待审/已审/举报） | 中 |
| 5 | `src/views/AdminRisk.vue` | 风控中心（规则/事件/黑名单/大盘） | 中 |
| 6 | `src/views/AdminAnnouncements.vue` | 公告管理（创建/编辑/统计） | 中 |
| 7 | `src/views/AdminMessages.vue` | 消息管理（群发/单发/批次） | 中 |
| 8 | `src/views/AdminRedeemCards.vue` | 卡密管理（批量生成/禁用） | 中 |
| 9 | `src/views/AdminRechargeOrders.vue` | 充值订单管理 | 中 |
| 10 | `src/views/AdminAuditLogs.vue` | 审计日志/访问日志 | 中 |
| 11 | `src/views/AdminReports.vue` | 财务报表/统计 | 低 |
| 12 | `src/views/AdminSettings.vue` | 系统设置 | 低 |

### 缺失的用户侧页面（3 个）

| # | 页面路径 | 说明 |
|---|----------|------|
| 1 | `src/views/account/Profile.vue` | 个人信息（16.1 定义） |
| 2 | `src/views/account/Balance.vue` | 余额与消费记录（16.1 定义） |
| 3 | `src/views/account/Messages.vue` | 消息中心（站内消息列表） |

---

## 八、前端路由缺失（需要添加到 `src/router/index.js`）

| # | 路径 | 页面 | 说明 |
|---|------|------|------|
| 1 | `/admin/dashboard` | AdminDashboard | 仪表盘 |
| 2 | `/admin/records` | AdminRecords | 生成记录 |
| 3 | `/admin/billing` | AdminBilling | 计费规则 |
| 4 | `/admin/review` | AdminReview | 内容审核 |
| 5 | `/admin/risk` | AdminRisk | 风控中心 |
| 6 | `/admin/announcements` | AdminAnnouncements | 公告管理 |
| 7 | `/admin/messages` | AdminMessages | 消息管理 |
| 8 | `/admin/redeem-cards` | AdminRedeemCards | 卡密管理 |
| 9 | `/admin/recharge-orders` | AdminRechargeOrders | 充值订单 |
| 10 | `/admin/audit-logs` | AdminAuditLogs | 审计日志 |
| 11 | `/admin/reports` | AdminReports | 报表 |
| 12 | `/admin/settings` | AdminSettings | 系统设置 |
| 13 | `/account/profile` | Profile | 个人信息 |
| 14 | `/account/balance` | Balance | 余额消费 |
| 15 | `/account/messages` | Messages | 消息中心 |

以及 `AdminShell.vue` 导航栏需要同步新增菜单项。

---

## 九、已有功能中的待完善项

### 9.1 认证模块
- **注册赠送金币**：`auth.js` 中 `verifyEmail` 方法有 TODO 注释，邮箱验证成功后未调用 `CoinService` 赠送注册金币
- **getProfile 用户信息**：`auth.js` 中有 TODO，未返回用户余额（balance）和用户组信息
- **换绑邮箱**：`changeEmail` 方法已发送验证码到新邮箱，但未实现验证新邮箱后更新 `users.email` 的完整流程

### 9.2 数据库连接
- `server/sql/init.sql` 中 `coin_transactions` 表的 `operator_type` ENUM 缺少 `cron` 类型（设计中包含）
- `server/sql/init.sql` 中 `user_balances` 表缺少 `design` 中定义的字段：`coins_frozen`, `total_gifted`, `total_expired`, `last_transaction_at`, `low_balance_alert`, `low_balance_threshold`

### 9.3 余额表字段不一致
`server-design.md` 9.2 定义的 `user_balances` 表字段更多：
- 当前 SQL 缺少：`coins_frozen`, `total_gifted`, `total_expired`, `last_transaction_at`, `low_balance_alert`, `low_balance_threshold`
- 当前 Model (`UserBalance.js`) 需同步补齐

### 9.4 金币流水表字段不一致
`coin_transactions` 在 `server-design.md` 9.2 中有 `tx_no`, `reason_code`, `description`, `client_ip`, `user_agent`, `cost_snapshot`, `is_reversed` 等字段，当前 SQL 和 Model 中缺少。

---

## 十、部署相关缺失

| # | 项目 | 说明 |
|---|------|------|
| 1 | `.env` 环境变量 | 缺少 SMTP/AES/STORAGE/CONTENT_REVIEW 等配置项 |
| 2 | `ecosystem.config.js` | 已有但需确认 PM2 配置 |
| 3 | Nginx 配置 | `/storage/` 静态映射未添加 |
| 4 | 存储目录结构 | `/www/wwwroot/doodle-canvas-storage/` 未创建 |

---

## 优先级建议

### 第一优先级（核心功能，影响使用）
1. 补全 `generation_records` 表 + Model + 生成记录服务 — 用户生成内容无记录
2. 实现文件上传/存储服务（`storage.js` + `files` 表） — 用户上传/生成图片无法持久化
3. 实现计费服务（`billing.js` + `billing_rules` 表） — 无法按模型扣费
4. 实现适配器（openai/aliyun/doubao） + 调度器（轮换/熔断） — 模型调用未后端化
5. 用户侧余额/流水/充值 API — 用户无法查看余额和充值
6. 管理后台仪表盘 + AdminShell 导航补齐
7. 注册赠送金币 + getProfile 返回余额/用户组

### 第二优先级（管理完善）
8. 内容审核模块（review） — 管理规范
9. 公告与站内消息系统 — 用户触达
10. 风控中心（risk rules/events）— 安全
11. 审计日志（audit_logs/access_logs） — 合规
12. 卡密系统（redeem_cards） — 商业化
13. 项目管理持久化（projects） — 数据不丢失

### 第三优先级（增强功能）
14. 系统设置（system_settings）
15. 数据迁移 API（migrate）
16. 报表统计
17. 对账报告