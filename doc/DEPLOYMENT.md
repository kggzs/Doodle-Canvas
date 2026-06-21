# 部署流程

更新时间：2026-06-21

## 部署模型

项目推荐使用单 Node 服务部署：

1. Vite 构建前端到 `dist/`。
2. Express 后端托管 `dist/` 静态文件。
3. Nginx 反向代理到 Node 服务。
4. MySQL 存业务数据，Redis 存限流、黑名单和任务元数据。
5. `server/storage/` 或外部挂载目录存上传与生成文件。

## 服务器准备

```bash
node -v
npm -v
mysql --version
redis-cli ping
```

建议：

| 组件 | 建议 |
| --- | --- |
| Node.js | 20 LTS |
| MySQL | 8.x，字符集 `utf8mb4` |
| Redis | 6.x+，开启持久化 |
| 进程管理 | PM2 或 systemd |
| 反向代理 | Nginx |

## 拉取与安装

```bash
git clone https://github.com/kggzs/Doodle-Canvas.git
cd Doodle-Canvas
npm install --omit=dev --no-audit
npm --prefix server install --omit=dev --no-audit
```

如果服务器上需要构建前端，应安装 dev 依赖：

```bash
npm install --include=dev --no-audit
```

## 数据库初始化

新服务器首次部署：

```bash
mysql -u root -p < server/sql/init.sql
```

存量数据库升级：

```bash
npm --prefix server run upgrade-core-features
mysql -u root -p canvas < server/sql/upgrade-20260621-announcements-user-updates.sql
```

合并归档文件：

```bash
mysql -u root -p < doc/all-sql-merged.sql
```

合并文件用于审阅和归档。生产升级前仍应根据当前数据库版本选择对应升级路径。

## 生产环境变量

`server/.env` 示例：

```env
NODE_ENV=production
PORT=3000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=canvas
DB_USER=canvas
DB_PASS=change-me

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=30d

CORS_ORIGINS=https://your-domain.example
FRONTEND_BASE=/
SERVE_FRONTEND=true
STORAGE_ROOT=/data/doodle-canvas/storage
STORAGE_BASE_URL=/storage
RATE_LIMIT_GLOBAL=600
```

安全要求：

- 不手动配置密钥时，服务会自动生成 `server/.runtime.env`。
- 必须备份 `server/.runtime.env`；文件丢失会导致旧 JWT 失效、已保存渠道 API Key 无法解密。
- 多实例部署必须共享同一组 `JWT_SECRET` / `AES_SECRET_KEY`，可复制 `.runtime.env` 或改用环境变量。
- `server/.env`、`server/.runtime.env`、`server/storage/` 不应提交到版本库。

## 构建与启动

```bash
npm run build
npm run start
```

PM2 示例：

```bash
pm2 start server/src/app.js --name doodle-canvas
pm2 save
```

也可以使用仓库内 `server/ecosystem.config.js`，根据服务器路径调整环境变量后启动：

```bash
pm2 start server/ecosystem.config.js
```

## Nginx 示例

```nginx
server {
    listen 80;
    server_name your-domain.example;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

生产建议开启 HTTPS，并将 HTTP 重定向到 HTTPS。

## 部署后检查

```bash
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/ready
pm2 logs doodle-canvas
```

检查项：

| 检查 | 预期 |
| --- | --- |
| `/api/health` | 返回 `status: ok` |
| `/api/ready` | MySQL、Redis、存储目录均为 `ok` |
| MySQL 日志 | 连接成功 |
| Redis 日志 | 连接成功 |
| `/admin` | 管理后台可访问 |
| 上传图片 | `server/storage/` 或挂载目录生成文件 |
