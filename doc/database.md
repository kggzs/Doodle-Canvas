# 数据库说明

更新时间：2026-06-21

数据库：MySQL  
默认库名：`canvas`  
字符集：`utf8mb4`  
排序规则：`utf8mb4_unicode_ci`

## SQL 文件

| 文件 | 用途 |
| --- | --- |
| `server/sql/init.sql` | 新库初始化，已合并当前版本所需表结构 |
| `server/sql/upgrade-user-groups-coins.sql` | 用户组与金币系统历史升级 |
| `server/sql/upgrade-core-features.sql` | 生成记录、文件存储、计费、项目等历史升级 |
| `server/sql/upgrade-20260621-announcements-user-updates.sql` | 公告表与用户组数据清理升级 |
| `doc/all-sql-merged.sql` | 所有 SQL 按顺序合并后的归档文件 |

## 核心表分组

### 用户与认证

| 表 | 说明 |
| --- | --- |
| `users` | 用户、状态、角色、封禁、风控、注册来源 |
| `refresh_tokens` | Refresh Token 哈希、设备、过期、撤销状态 |
| `email_verifications` | 邮箱验证码哈希、用途、过期、尝试次数 |
| `login_logs` | 登录成功/失败/锁定等日志 |

### 用户组与金币

| 表 | 说明 |
| --- | --- |
| `user_groups` | 用户分组、价格倍率、每日生成上限 |
| `user_group_members` | 用户与组关系 |
| `user_balances` | 当前余额与累计统计 |
| `coin_transactions` | 金币流水与生成/管理员操作上下文 |

### 模型与渠道

| 表 | 说明 |
| --- | --- |
| `model_channels` | 上游渠道地址、provider、加密 API Key、熔断统计 |
| `models` | 模型配置、展示名、默认参数 |
| `model_channel_bindings` | 模型与渠道绑定、轮换策略、权重 |
| `billing_rules` | 模型计费规则 |

### 生成、文件与项目

| 表 | 说明 |
| --- | --- |
| `generation_records` | 生成请求、状态、结果、错误、计费快照 |
| `files` | 上传和生成文件元数据、软删除状态 |
| `projects` | 画布项目、节点/边/视口数据 |

### 系统与运营

| 表 | 说明 |
| --- | --- |
| `system_settings` | 系统配置项 |
| `error_logs` | 服务端、上游、存储等错误记录 |
| `announcements` | 前台公告 |
| `migrate_imports` | 迁移导入记录 |

## 新库初始化

```bash
mysql -u root -p < server/sql/init.sql
```

`init.sql` 已包含当前项目运行所需表结构。新部署不需要再叠加历史升级脚本。

## 存量库升级

按数据库当前版本选择对应脚本。核心功能升级建议优先使用后端脚本，因为它能兼容不支持 `ADD COLUMN IF NOT EXISTS` 的 MySQL 版本：

```bash
npm --prefix server run upgrade-core-features
```

公告与用户组清理升级：

```bash
mysql -u root -p canvas < server/sql/upgrade-20260621-announcements-user-updates.sql
```

## 注意事项

- 执行任何升级脚本前先备份数据库。
- 不要把测试模型渠道、API Key、生成记录写进初始化脚本。
- 新服务器优先使用 `server/sql/init.sql`。
- `doc/all-sql-merged.sql` 是合并归档，不替代版本化迁移工具。
- 建议后续引入 Sequelize migration 或独立迁移工具，避免手工维护历史升级顺序。

