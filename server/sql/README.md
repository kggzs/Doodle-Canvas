# 数据库脚本说明

## 新服务器部署

新服务器只需要执行：

```bash
mysql -u root -p < server/sql/init.sql
```

`init.sql` 是当前项目的合并版初始化脚本，已覆盖历史升级脚本中的表结构，和 `server/src/models` 下的 Sequelize 模型字段一致。

脚本只包含必要的基础数据：

- 默认用户组：`普通用户`
- 系统设置：站点名、注册赠送、计费、存储等默认配置

脚本不包含测试业务数据：

- 不创建测试用户或管理员
- 不写入 API 渠道、API Key、模型配置和计费规则
- 不写入生成记录、文件记录、金币流水、登录日志、错误日志
- 不依赖本地 `server/storage` 文件

首次部署后用脚本创建管理员账号：

```bash
npm run create-admin -- --email admin@example.com --username admin --password 'ChangeMe123'
```

再登录后台配置渠道、模型和计费规则。

## 存量数据库升级

以下脚本仅用于已经部署过旧版数据库的环境，不用于新服务器初始化：

- `upgrade-user-groups-coins.sql`：旧版用户组/金币系统升级参考
- `upgrade-core-features.sql`：旧版核心功能补表参考

如果是全新服务器，执行 `init.sql` 即可，不要再叠加执行这些升级脚本。

## 当前检查结果

已按当前代码比对 `server/src/models` 的所有 Sequelize 模型，`init.sql` 中 18 张表没有缺表或漏字段。
