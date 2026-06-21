# 运行指南

更新时间：2026-06-21

## 环境要求

| 依赖 | 建议版本 |
| --- | --- |
| Node.js | 18+，推荐 20+ |
| MySQL | 8.x 或兼容版本 |
| Redis | 6.x+ |
| npm | 随 Node 安装即可 |

## 安装依赖

```bash
npm install --include=dev --no-audit
npm --prefix server install --include=dev --no-audit
```

## 初始化数据库

新库优先使用当前初始化脚本：

```bash
mysql -u root -p < server/sql/init.sql
```

如需查看所有 SQL 的合并结果，可使用：

```bash
mysql -u root -p < doc/all-sql-merged.sql
```

注意：`doc/all-sql-merged.sql` 是所有 SQL 的合并归档，包含历史升级段。新部署建议以 `server/sql/init.sql` 为准，存量数据库升级优先使用对应升级脚本或后端脚本。

## 配置后端环境变量

复制示例文件：

```bash
copy server\.env.example server\.env
```

至少配置：

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=canvas
DB_USER=canvas
DB_PASS=your-password
REDIS_HOST=localhost
REDIS_PORT=6379
```

生产环境建议配置：

```env
NODE_ENV=production
CORS_ORIGINS=https://your-domain.example
STORAGE_ROOT=/data/doodle-canvas/storage
STORAGE_BASE_URL=/storage
```

如果不配置 `JWT_SECRET` 和 `AES_SECRET_KEY`，后端会自动生成到 `server/.runtime.env`。请备份这个文件，不要提交到版本库。

## 启动方式

开发时单服务运行：

```bash
npm run dev
```

后端开发热重载：

```bash
npm run server:dev
```

生产构建：

```bash
npm run build
npm run start
```

## 创建管理员

```bash
npm run create-admin -- --email admin@example.com --username admin --password Admin123456
```

## 常用入口

| 页面 | 地址 |
| --- | --- |
| 前台首页 | `http://localhost:3000/` |
| 项目列表 | `http://localhost:3000/projects` |
| 管理后台 | `http://localhost:3000/admin` |
| 健康检查 | `http://localhost:3000/api/health` |

## 验证命令

```bash
npm run build
npm audit --omit=dev --registry=https://registry.npmjs.org
npm --prefix server audit --omit=dev --registry=https://registry.npmjs.org
```

当前验证结果：

| 命令 | 结果 |
| --- | --- |
| `npm run build` | 通过 |
| 前端依赖审计 | 0 vulnerabilities |
| 后端依赖审计 | 0 vulnerabilities |

## 常见问题

### npm audit 在 npmmirror 失败

`npmmirror` 当前不支持 npm audit 的安全接口，可临时指定官方 registry：

```bash
npm audit --omit=dev --registry=https://registry.npmjs.org
```

### 后端启动但接口失败

当前后端在 MySQL 或 Redis 连接失败时会继续启动。请检查 `server/.env`、数据库账号、Redis 地址和日志输出。

### 前端构建后后端找不到页面

确认 `npm run build` 已生成 `dist/`，并且 `SERVE_FRONTEND` 未设置为 `false`。
