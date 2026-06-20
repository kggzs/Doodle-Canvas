# Doodle-Canvas 剩余未完善功能

> 更新时间：2026-06-20
> 口径：只列当前代码尚未完整落地的功能，不再包含已完成的生成记录、文件、计费、项目、错误日志等核心能力。

## 已完成的核心缺口

以下能力已在当前代码中实现，旧清单中不再视为缺失：

- `files`、`generation_records`、`billing_rules`、`projects`、`system_settings`、`migrate_imports`、`error_logs` 等核心表和 Sequelize Model。
- 本地文件存储、生成结果转存、软删除、管理员恢复。
- 用户侧余额、流水、费用预估、生成记录、项目 CRUD、图片上传、文件删除。
- 管理侧 Dashboard、生成记录、计费规则、文件管理、错误日志。
- 后端化模型调用、API Key 加密、同类型模型渠道绑定、多线路轮换。
- 注册赠送金币、默认用户组、`/auth/me` 返回余额和用户组。
- 根路径官网、登录后进入 `/projects`、项目云端保存。

## 第一优先级：商业化闭环

| 功能 | 当前状态 | 建议落地点 |
| --- | --- | --- |
| 充值订单 | 未实现订单表、支付状态、后台查询 | `recharge_orders` Model、`/api/recharge/*`、`/api/admin/recharge/*` |
| 卡密兑换 | 未实现卡密生成、兑换、禁用、过期 | `redeem_cards` Model、用户兑换接口、后台批量生成 |
| 管理员手动充值 | 金币流水能力已有，但后台充值/扣减流程需继续完善 | `/api/admin/coins/*` 和 AdminCoins |
| 对账报表 | 现有流水可查，缺少日级对账报告 | `/api/admin/coins/reconciliation` |

## 第二优先级：安全合规与治理

| 功能 | 当前状态 | 建议落地点 |
| --- | --- | --- |
| 审计日志 | `request_id` 和错误日志已具备，管理员操作审计未完整落库 | `audit_logs`、管理中间件、后台审计页 |
| 访问日志 | 当前主要依赖请求日志和错误日志 | `access_logs`、异步写入关键 API |
| 内容审核 | 生成记录有审核字段方向，但审核队列和处理流未实现 | `content_review`、`content_reports`、后台 Review |
| 举报 | 用户侧举报接口和后台处理页未实现 | `/api/reports`、`/api/admin/reports` |
| 风控规则 | 限流已有，业务风控规则/事件未实现 | `risk_rules`、`risk_events`、后台 Risk |
| 封禁流水 | 用户状态字段已有，独立封禁历史未实现 | `user_bans`、用户详情封禁历史 |
| 申诉 | 用户申诉和管理员处理未实现 | `appeals` 相关表与 API |

## 第三优先级：用户触达

| 功能 | 当前状态 | 建议落地点 |
| --- | --- | --- |
| 公告 | 未实现全站公告、弹窗公告、定向公告 | `announcements`、`announcement_reads` |
| 站内消息 | 未实现消息中心和群发批次 | `messages`、`message_broadcasts` |
| 用户消息页 | 当前只有 `Account.vue` 总页 | `/account/messages` |

## 第四优先级：用户中心细化

当前已有 `/account` 页面，但未拆成完整用户中心。

建议新增：

- `/account/profile`：个人资料、邮箱、密码。
- `/account/balance`：余额、流水、费用说明。
- `/account/messages`：站内消息。
- `/account/records`：用户生成记录入口。

## 第五优先级：迁移与运维增强

| 功能 | 当前状态 | 建议 |
| --- | --- | --- |
| localStorage 迁移 API | `migrate_imports` 表存在，接口未实现 | `/api/migrate/local`、`/api/migrate/status` |
| 文件物理清理 | 软删除已实现，定期物理清理未实现 | 定时任务清理超过保留期文件 |
| 渠道自动熔断恢复 | 记录成功/失败和 circuit 字段已有，自动策略可增强 | 定时健康检查与半开恢复 |
| 模型调用真实集成测试 | 依赖有效第三方 Key | 增加可配置 mock upstream 或测试渠道 |

## 建议实施顺序

1. 充值订单和卡密兑换，补齐商业闭环。
2. 审计日志和访问日志，补齐后台可追溯性。
3. 内容审核、举报、风控、封禁流水，补齐治理闭环。
4. 公告、站内消息、用户中心，改善用户触达和自助查询。
5. 数据迁移、物理清理、自动熔断恢复，提升长期运维质量。
