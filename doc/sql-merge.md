# SQL 合并说明

更新时间：2026-06-21

合并输出文件：

```text
doc/all-sql-merged.sql
```

## 合并来源与顺序

| 顺序 | 来源 |
| --- | --- |
| 1 | `server/sql/init.sql` |
| 2 | `server/sql/upgrade-user-groups-coins.sql` |
| 3 | `server/sql/upgrade-core-features.sql` |
| 4 | `server/sql/upgrade-20260621-announcements-user-updates.sql` |

## 使用建议

新数据库部署：

```bash
mysql -u root -p < server/sql/init.sql
```

查看或审计完整 SQL：

```bash
less doc/all-sql-merged.sql
```

确需一次性执行合并文件：

```bash
mysql -u root -p < doc/all-sql-merged.sql
```

注意：

- `init.sql` 已是当前新库初始化脚本，历史升级段主要用于存量库。
- 合并文件保留所有历史 SQL 内容，因此可能包含重复的 `CREATE TABLE IF NOT EXISTS` 或兼容性升级语句。
- `upgrade-core-features.sql` 中使用了 `ADD COLUMN IF NOT EXISTS`，旧 MySQL 版本可能不支持。存量库建议使用 `npm --prefix server run upgrade-core-features`。
- 生产执行前务必备份数据库，并在测试库先验证。

