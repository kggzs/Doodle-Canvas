# Doodle-Canvas 开发进度记录

> 日期：2026-06-18  
> 基线文档：`doc/missing-features.md`、`doc/server-design.md`、`数据信息.md`

## 本次目标

围绕 `missing-features.md` 第一优先级继续开发，优先补齐后端可闭环能力：

- 生成记录持久化
- 本地文件存储与软删除
- 计费规则、费用预估、生成预扣费与失败退款
- 用户侧余额、流水、生成记录、项目持久化接口
- 管理侧计费规则、生成记录、文件列表/恢复接口
- 注册邮箱验证后的默认用户组与注册赠送金币

## 设计决策

1. 本地存储按 `server-design.md` v3.2 执行：默认使用 `server/storage`，访问路径为 `/storage/*`，生产环境仍建议由 Nginx 映射。
2. 金币变动只通过 `CoinService.transact()` 写入，生成消费使用 `consume`，失败退款使用 `refund`，注册赠送使用 `register_gift`。
3. `users.user_group_id` 仅作为主组展示冗余字段；计费倍率以有效期内的 `user_group_members` 关联为准。
4. 计费规则未配置时费用为 `0`，允许模型先免费运行；配置 `billing_rules` 后生成流程会自动预扣。
5. 第三方生成结果会尝试转存到本地；转存失败时保留上游原始 URL，并记录 warning，不阻断用户拿到结果。
6. 生成记录先创建为 `processing`，成功后更新为 `completed`，失败更新为 `failed` 并写 `error_message`。
7. 对已有库新增 `server/sql/upgrade-core-features.sql`，避免只更新 `init.sql` 导致存量环境缺字段。
8. 前端认证状态改为响应式 token + user 共同判断，避免登录成功后只更新用户信息、路由守卫仍认为未登录；401 清理本地会话时同步通知 auth store 清空响应式状态。

## 已实现内容

### 数据模型

- 新增 `BillingRule`、`GenerationRecord`、`File`、`Project`、`SystemSetting`、`MigrateImport` Sequelize Model。
- 更新 `UserBalance`：补齐 `coins_frozen`、`total_recharged`、`total_gifted`、`total_expired`、`last_transaction_at`、低余额提醒字段。
- 更新 `CoinTransaction`：补齐 `tx_no`、`related_tx_id`、`reason_code`、`description`、`client_ip`、`user_agent`、`cost_snapshot`、`is_reversed`，并扩展流水类型。
- 更新 `server/src/models/index.js` 关联关系。

### 服务层

- 新增 `storage.js`：上传、远程生成结果转存、文件软删除、管理员恢复、文件列表。
- 新增 `billing.js`：费用预估、用户组倍率、基础配额检查、生成预扣、失败退款、计费规则 CRUD。
- 新增 `project.js`：项目列表、创建、详情、更新、删除。
- 新增 `records.js`：用户侧/管理侧生成记录查询。
- 更新 `generation.js`：图片、视频、非流式对话接入生成记录、计费和文件转存；视频异步任务完成后回写记录。
- 更新 `auth.js`：邮箱验证成功后加入默认用户组，初始化余额并写注册赠送金币流水；`/auth/me` 返回余额和用户组。
- 更新 `coins.js`：支持新流水类型、余额汇总和用户侧流水查询。

### 路由层

- 新增用户侧接口：
  - `GET /api/coins/balance`
  - `GET /api/coins/summary`
  - `GET /api/coins/transactions`
  - `GET /api/billing/estimate`
  - `GET /api/records`
  - `GET /api/records/:id`
  - `POST /api/upload/image`
  - `GET /api/files/:id`
  - `DELETE /api/files/:id`
  - `GET/POST /api/projects`
  - `GET/PUT/DELETE /api/projects/:id`
- 新增管理侧接口：
  - `GET/POST /api/admin/billing/rules`
  - `PUT/DELETE /api/admin/billing/rules/:id`
  - `GET /api/admin/records`
  - `GET /api/admin/records/:id`
  - `GET /api/admin/files`
  - `POST /api/admin/files/:id/restore`

### 数据库脚本

- 更新 `server/sql/init.sql`：补齐核心表与字段。
- 新增 `server/sql/upgrade-core-features.sql`：用于存量 `canvas` 数据库升级。
- 新增 `server/src/scripts/upgrade-core-features.js`：兼容当前 MySQL/MariaDB 环境的存量库升级脚本，已加入 `npm --prefix server run upgrade-core-features`。

## 测试记录

已执行：

- `git diff --check`：通过，仅有 Git 换行符提示。
- `node --check`：全量检查 `server/src/**/*.js`，通过。
- 后端路由装载检查：`import('./server/src/routes/index.js')`，通过；首次检查因 Redis 客户端保持事件循环未退出而超时，重跑时显式断开 Redis 后通过。
- `npm run build`：通过，Vite 成功构建前端产物。
- 数据库初始化：已在本机 `canvas` 库执行 `server/sql/init.sql`。
- 数据库升级：纯 SQL 版升级脚本因当前数据库不支持 `ADD COLUMN IF NOT EXISTS` 语法未执行成功；随后执行兼容版 `node src/scripts/upgrade-core-features.js`，通过。
- 浏览器登录验证：通过 in-app Browser 访问 `http://127.0.0.1:5173/huobao-canvas/login`，使用测试管理员登录后成功进入 `/admin/users`。
- 后台页面验证：`/admin/users`、`/admin/user-groups`、`/admin/coins`、`/admin/channels`、`/admin/models` 均可打开，页面包含管理后台壳、导航和关键控件，浏览器控制台无 error。
- 退出与路由守卫：点击「退出」后跳转登录页；未登录访问 `/admin/users` 会重定向到 `/login?redirect=/admin/users`。
- 登录回归复测：用户侧曾看到 `POST /api/auth/login 500`，定位为后端 3000 端口未监听，重启后 `/api/health` 正常；随后发现登录 200 后停留登录页，修复 `src/stores/auth.js` 的非响应式 token 状态后，浏览器闭环通过：退出 -> 访问后台触发守卫 -> 登录 -> 自动回到 `/admin/users`。
- API 冒烟：通过 `/api/auth/login` 重新登录后，`/api/auth/me`、`/api/coins/balance`、`/api/coins/summary`、`/api/records`、`/api/admin/records`、`/api/admin/billing/rules`、`/api/admin/files` 均返回 `code=0`。
- 项目 CRUD 冒烟：`POST /api/projects`、`GET /api/projects/:id`、`DELETE /api/projects/:id` 通过。

未执行：

- 未调用真实第三方模型接口验证生成转存，因为需要有效渠道 API Key 和外部服务配额。

## 后续未完成

- 充值订单与卡密兑换完整流程。
- 内容审核、举报、风控规则与封禁流水。
- 公告与站内消息系统。
- 审计日志、访问日志完整落库。
- 管理后台新增页面：Dashboard、Records、Billing、Review、Risk、Announcements、Messages、RedeemCards、RechargeOrders、AuditLogs、Reports、Settings。
- 用户中心页面：Profile、Balance、Messages。
- 数据迁移 API：`/api/migrate/*`。
