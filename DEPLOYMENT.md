# Doodle-Canvas 部署流程

当前部署方式是“前端构建为 `dist/`，后端 Express 同时提供 `/api`、`/storage` 和前端页面，Nginx 只反向代理到 Node 服务”。

## 1. 准备服务器

推荐环境：

- Node.js 20 LTS 或更高
- MySQL 8.x
- Redis 6.x 或更高
- PM2
- Nginx

安装 PM2：

```bash
npm install -g pm2
```

## 2. 拉取代码并安装依赖

```bash
git clone https://github.com/kggzs/Doodle-Canvas.git
cd Doodle-Canvas

npm ci
npm --prefix server ci
```

如果服务器不适合使用 `npm ci`：

```bash
npm install --include=dev --no-audit
npm --prefix server install --include=dev --no-audit
```

## 3. 初始化数据库

创建数据库和账号：

```sql
CREATE DATABASE IF NOT EXISTS `canvas`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'canvas'@'localhost' IDENTIFIED BY 'replace_with_strong_password';
GRANT ALL PRIVILEGES ON `canvas`.* TO 'canvas'@'localhost';
FLUSH PRIVILEGES;
```

导入初始化脚本：

```bash
mysql -u root -p < server/sql/init.sql
```

说明：

- 新服务器只执行 `server/sql/init.sql`。
- `upgrade-*.sql` 和 `npm --prefix server run upgrade-core-features` 只用于旧库升级。
- 初始化脚本不会创建测试用户、API Key、渠道、模型、计费规则、生成记录、文件记录或金币流水。

## 4. 配置环境变量

```bash
cp server/.env.example server/.env
```

必须检查：

- `NODE_ENV=production`
- `PORT=3000`
- `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASS`
- `REDIS_HOST`、`REDIS_PORT`、`REDIS_PASS`
- `JWT_SECRET`，至少 32 字节
- `AES_SECRET_KEY`，正好 32 个 ASCII 字符
- `STORAGE_ROOT`，生产存储目录
- `STORAGE_BASE_URL=/storage`
- SMTP 配置，如果需要真实发送注册验证码

生成密钥：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

生产示例：

```env
NODE_ENV=production
PORT=3000
SERVE_FRONTEND=true
FRONTEND_BASE=/
FRONTEND_DIST_DIR=../../dist
CORS_ORIGINS=https://example.com
STORAGE_ROOT=/www/wwwroot/doodle-canvas-storage
STORAGE_BASE_URL=/storage
AUTH_REDIS_FAILURE_MODE=deny
RATE_LIMIT_GLOBAL=600
```

创建目录：

```bash
mkdir -p /www/wwwroot/doodle-canvas-storage
mkdir -p server/logs
```

## 5. 构建前端

```bash
npm run build
test -f dist/index.html && echo "dist ok"
```

当前 Vite `base` 和 Vue Router history 都使用根路径 `/`。如果需要子路径部署，需要同时调整 `vite.config.js`、后端 `FRONTEND_BASE` 和 Nginx。

## 6. 启动后端

临时验证：

```bash
npm run start
curl http://127.0.0.1:3000/api/health
```

PM2 启动：

```bash
cd server
pm2 start ecosystem.config.js --env production
pm2 save
cd ..
```

常用命令：

```bash
pm2 status
pm2 logs doodle-canvas-server
pm2 restart doodle-canvas-server
```

## 7. 配置 Nginx

项目根目录的 `nginx.conf` 已按单 Node 服务模式整理。复制后修改域名：

```bash
cp nginx.conf /etc/nginx/conf.d/doodle-canvas.conf
nginx -t
systemctl reload nginx
```

建议让 `/storage/*` 也反向代理给 Node，不要直接 `alias` 到磁盘目录。后端访问文件前会检查 `files` 表状态，直接暴露磁盘会绕过软删除和隔离逻辑。

## 8. 创建管理员并配置后台

```bash
npm run create-admin -- --email admin@example.com --username admin --password 'ChangeMe123'
```

登录 `/admin` 后完成：

- 创建问答、图片、视频模型。
- 创建同类型渠道，填写 API Base URL、API 路径、API Key。
- 绑定渠道并设置轮换策略。
- 配置计费规则。
- 通过模型页或真实生成请求验证渠道可用。

## 9. 上线检查

- `curl http://127.0.0.1:3000/api/health` 返回 `code=0`。
- 域名首页、`/login`、`/projects`、`/admin/dashboard` 刷新不 404。
- 管理员能登录后台。
- `/admin/models/chat`、`/admin/models/image`、`/admin/models/video` 可保存配置。
- `/api/models` 能看到公开模型。
- 能完成一次聊天或图片生成。
- `/admin/records`、`/admin/files`、`/admin/error-logs` 可打开。
- `STORAGE_ROOT` 不在 Git 工作区内。
- `server/sql/init.sql` 已导入，未导入本地测试数据。

## 10. 更新发布

```bash
git pull
npm ci
npm --prefix server ci
npm run build
pm2 restart doodle-canvas-server
curl http://127.0.0.1:3000/api/health
```

如果版本包含数据库迁移：

1. 备份数据库。
2. 运行对应升级脚本或 `npm --prefix server run upgrade-core-features`。
3. 再重启 PM2。

## 11. 宝塔启动脚本排查

如果宝塔 Node 项目管理提示：

```text
/www/server/nodejs/vhost/scripts/Doodle_Canvas_service.sh: 行 7: /bin/nohup: 无法执行：找不到需要的文件
```

优先使用 PM2。必须继续使用宝塔脚本时，检查 `nohup`：

```bash
command -v nohup
ls -l /bin/nohup /usr/bin/nohup 2>/dev/null
```

如果 `nohup` 在 `/usr/bin/nohup`：

```bash
ln -sf /usr/bin/nohup /bin/nohup
```

如果系统没有 `nohup`：

```bash
apt-get update && apt-get install -y coreutils
```

或把宝塔生成脚本中的 `/bin/nohup` 改成 `nohup`。
