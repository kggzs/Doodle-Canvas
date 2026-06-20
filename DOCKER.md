# Doodle-Canvas Docker 部署

Docker 版本只启动应用服务：

- `app`：构建前端并运行 Express，统一监听容器内 `3000`

MySQL 和 Redis 使用宿主机已有服务，不会重复创建数据库或 Redis 容器。

## 准备宿主机服务

确保宿主机已有 MySQL 和 Redis，并已导入数据库：

```bash
mysql -u root -p < server/sql/init.sql
```

容器默认通过 `host.docker.internal` 访问宿主机。Linux Docker 已在 `docker-compose.yml` 中配置 `host-gateway` 映射。

MySQL 如果只监听 `127.0.0.1`，容器可能无法连接。需要让 MySQL 监听宿主机网关可访问地址，例如 `0.0.0.0` 或 Docker 网桥地址，并给 `canvas` 用户授权容器来源。示例：

```sql
CREATE USER IF NOT EXISTS 'canvas'@'%' IDENTIFIED BY 'replace_with_strong_mysql_password';
GRANT ALL PRIVILEGES ON `canvas`.* TO 'canvas'@'%';
FLUSH PRIVILEGES;
```

## 快速启动

```bash
cp .env.docker.example .env
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3000/api/health
```

访问：

- 前端：http://localhost:3000/
- 后台：http://localhost:3000/admin/login
- 健康检查：http://localhost:3000/api/health

## 生产环境配置

先复制环境变量模板：

```bash
cp .env.docker.example .env
```

至少修改：

- `DB_HOST` / `DB_PORT`，如果宿主机服务不是默认地址
- `DB_PASS`
- `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASS`
- `JWT_SECRET`
- `AES_SECRET_KEY`
- `CORS_ORIGINS`，如果使用域名访问
- SMTP 配置，如果需要发送邮箱验证码

生成密钥：

```bash
# JWT_SECRET：至少 32 字节
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# AES_SECRET_KEY：必须正好 32 个 ASCII 字符
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

启动：

```bash
docker compose up -d --build
```

## 创建管理员

```bash
docker compose exec app node server/src/scripts/create-admin.js \
  --email admin@example.com \
  --username admin \
  --password 'ChangeMe123'
```

## 常用命令

```bash
docker compose logs -f app
docker compose restart app
docker compose down
docker compose down -v
```

`docker compose down -v` 会删除应用上传文件和日志卷；不会删除宿主机 MySQL 或 Redis 数据。

## 数据持久化

Compose 使用以下命名卷：

- `app_storage`：上传文件和生成文件
- `app_logs`：应用日志

## Nginx 反向代理

如果使用域名，把 Nginx 反代到 Docker 暴露的 `3000`：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
