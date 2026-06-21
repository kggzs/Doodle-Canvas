# 数据库脚本说明

## 新服务器部署

新服务器只执行：

```bash
mysql -u root -p < server/sql/init.sql
```

`init.sql` 是当前合并版结构，和 `server/src/models` 下的 Sequelize 模型保持一致。脚本包含 19 张核心表：

- 用户与认证：`users`、`refresh_tokens`、`email_verifications`、`login_logs`
- 用户组与金币：`user_groups`、`user_group_members`、`user_balances`、`coin_transactions`
- 模型与渠道：`models`、`model_channels`、`model_channel_bindings`
- 生成与文件：`generation_records`、`files`
- 项目与迁移：`projects`、`migrate_imports`
- 计费、系统与公告：`billing_rules`、`system_settings`、`announcements`
- 错误日志：`error_logs`

脚本只写入必要基础数据：

- 默认用户组：`普通用户`
- 系统设置：站点名、注册赠送、计费、存储等默认配置

脚本不包含：

- 测试用户或管理员
- API 渠道、API Key、模型配置和计费规则
- 生成记录、文件记录、金币流水、登录日志、错误日志
- 本地 `server/storage` 文件

首次部署后创建管理员：

```bash
npm run create-admin -- --email admin@example.com --username admin --password 'ChangeMe123'
```

再登录后台配置渠道、模型和计费规则。

## 存量数据库升级

以下脚本只用于旧环境升级：

- `upgrade-user-groups-coins.sql`：旧版用户组/金币系统升级参考。
- `upgrade-core-features.sql`：旧版核心功能补表参考。
- `upgrade-20260621-announcements-user-updates.sql`：本次公告、用户组单组约束相关升级脚本。
- `npm --prefix server run upgrade-core-features`：兼容部分 MySQL/MariaDB 语法差异的 Node 升级脚本。

全新服务器不要叠加执行升级脚本。

## 维护规则

- 修改 Sequelize Model 后，同步更新 `init.sql`。
- 新增历史升级脚本时，仍要把最终结构合并回 `init.sql`。
- 初始化脚本不得包含本地测试账号、真实 API Key、生成结果或业务流水。
- 文档中的数据库密码必须使用占位符。
