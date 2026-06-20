# Doodle-Canvas 部署流程

本文按当前项目结构整理：前端执行 `npm run build` 输出到 `dist/`，后端 Express 同时提供 `/api`、`/storage` 和前端页面。Nginx 只做反向代理。

## 1. 服务器准备

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

如果服务器无法使用 `npm ci`，可改用：

```bash
npm install
npm --prefix server install
```

## 3. 初始化数据库

先创建数据库账号并授权：

```sql
CREATE DATABASE IF NOT EXISTS `canvas`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'canvas'@'localhost' IDENTIFIED BY 'replace_with_strong_password';
GRANT ALL PRIVILEGES ON `canvas`.* TO 'canvas'@'localhost';
FLUSH PRIVILEGES;
```

导入当前合并版 SQL：

```bash
mysql -u root -p < server/sql/init.sql
```

说明：

- `server/sql/init.sql` 是新服务器部署入口，已合并历史升级脚本中的当前表结构。
- `upgrade-*.sql` 只用于旧数据库升级，新部署不要重复执行。
- 初始化 SQL 不包含测试用户、渠道 Key、模型配置、生成记录、文件记录、金币流水等测试/业务数据。
- 默认用户组和系统设置是程序运行基础数据，需要保留。

## 4. 配置环境变量

```bash
cp server/.env.example server/.env
```

必须修改：

- `DB_PASS`
- `CORS_ORIGINS`
- `JWT_SECRET`
- `AES_SECRET_KEY`
- `STORAGE_ROOT`
- SMTP 配置，如果需要邮箱验证码真实发送

生成密钥参考：

```bash
# JWT_SECRET：至少 32 字节
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# AES_SECRET_KEY：必须正好 32 个 ASCII 字符
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

生产环境建议：

```env
NODE_ENV=production
PORT=3000
SERVE_FRONTEND=true
FRONTEND_BASE=/
FRONTEND_DIST_DIR=../../dist
STORAGE_ROOT=/www/wwwroot/doodle-canvas-storage
STORAGE_BASE_URL=/storage
AUTH_REDIS_FAILURE_MODE=deny
```

创建存储与日志目录：

```bash
mkdir -p /www/wwwroot/doodle-canvas-storage
mkdir -p server/logs
```

## 5. 构建前端

当前 Vite 和 Vue Router 都使用根路径 `/`：

```bash
npm run build
```

构建完成后确认：

```bash
test -f dist/index.html && echo "dist ok"
```

## 6. 启动后端

临时启动验证：

```bash
npm run start
```

健康检查：

```bash
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

项目根目录的 `nginx.conf` 已按当前单 Node 服务模式整理。部署时复制到站点配置目录后 reload：

```bash
cp nginx.conf /etc/nginx/conf.d/doodle-canvas.conf
nginx -t
systemctl reload nginx
```

如果有域名，把 `server_name _;` 改成实际域名，并在 HTTPS 配置中继续反向代理到 `http://127.0.0.1:3000`。

注意：`/storage/` 不建议直接 `alias` 到磁盘目录。当前后端会检查 `files` 表状态，直接由 Nginx 暴露磁盘会绕过软删除和隔离逻辑。

## 8. 创建管理员并完成后台配置

创建管理员：

```bash
npm run create-admin -- --email admin@example.com --username admin --password 'ChangeMe123'
```

登录后配置：

- `/admin/models/chat`、`/admin/models/image`、`/admin/models/video`：创建模型
- 在模型详情中创建或绑定渠道地址
- 配置计费规则
- 通过渠道测试确认 API Base URL 和 Key 可用

## 9. 上线检查清单

- `curl http://127.0.0.1:3000/api/health` 返回 `status: ok`
- 浏览器访问域名首页正常
- 刷新 `/login`、`/admin/login`、`/projects` 不出现 404
- 管理员能登录后台
- 能创建渠道、模型和计费规则
- 能完成一次图片或聊天生成
- `server/storage/` 没有进入 Git，生产存储目录在 `STORAGE_ROOT`
- `server/sql/init.sql` 已导入，未导入本地测试数据

## 10. 更新发布

```bash
git pull
npm ci
npm --prefix server ci
npm run build
pm2 restart doodle-canvas-server
curl http://127.0.0.1:3000/api/health
```

若后续有新的迁移脚本，先备份数据库，再执行迁移；全新部署仍以 `server/sql/init.sql` 为准。
