# Doodle-Canvas 运行指南

本文面向本地开发、联调和单机验证。生产部署请看 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 环境要求

| 依赖 | 建议版本 |
| --- | --- |
| Node.js | 20 LTS 或更高，最低 18 |
| npm | 9 或更高 |
| MySQL | 8.x 或兼容版本 |
| Redis | 6.x 或更高 |

## 安装依赖

根目录和 `server/` 各有一份 `package.json`，需要分别安装：

```bash
npm install --include=dev --no-audit
npm --prefix server install --include=dev --no-audit
```

如果使用 pnpm，只建议用于前端依赖；当前后端以 npm lockfile 为准。

## 配置数据库

创建数据库和账号：

```sql
CREATE DATABASE IF NOT EXISTS `canvas`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'canvas'@'localhost' IDENTIFIED BY 'replace_with_password';
GRANT ALL PRIVILEGES ON `canvas`.* TO 'canvas'@'localhost';
FLUSH PRIVILEGES;
```

导入初始化脚本：

```bash
mysql -u root -p < server/sql/init.sql
```

`init.sql` 是当前完整结构，只包含默认用户组和系统设置，不包含测试用户、API Key、模型、渠道、生成记录和文件记录。

## 配置环境变量

复制模板：

```bash
copy server\.env.example server\.env
```

本地最少修改：

```env
NODE_ENV=development
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=canvas
DB_USER=canvas
DB_PASS=replace_with_password
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

开发环境如果没有配置 `JWT_SECRET` 和 `AES_SECRET_KEY`，服务启动时会生成到 `server/.runtime.env`。生产环境建议手动配置：

```env
JWT_SECRET=至少32字节的随机字符串
AES_SECRET_KEY=正好32个ASCII字符
```

## 启动方式

推荐单服务启动：

```bash
npm run dev
```

该命令等价于：

1. `npm run build`
2. `npm run start`

后端默认监听 `3000`，并托管 `dist/`：

- 首页：http://localhost:3000/
- 项目列表：http://localhost:3000/projects
- 管理后台：http://localhost:3000/admin
- 健康检查：http://localhost:3000/api/health

只启动后端开发服务：

```bash
npm run server:dev
```

Vite 独立开发服务配置在 `vite.config.js`，端口为 `3003`。当前代理目标同样是 `http://localhost:3003`，日常联调更推荐使用单服务模式，避免前后端端口混淆。

## 创建管理员

```bash
npm run create-admin -- --email admin@example.com --username admin --password Admin123456
```

创建后访问 `/admin` 登录。普通用户没有后台权限，会被引导回 `/projects`。

## 首次配置模型

1. 进入 `/admin/models/chat` 创建问答模型和渠道。
2. 进入 `/admin/models/image` 创建图片模型和渠道。
3. 进入 `/admin/models/video` 创建视频模型和渠道。
4. 确认模型已启用，且绑定了至少一个同类型启用渠道。
5. 需要扣费时配置计费规则。图片模型最低消耗 1 金币。

用户侧模型下拉只显示 `/api/models` 返回的公开模型，不再混入旧版前端内置模型。

## 常用页面

| 页面 | 地址 |
| --- | --- |
| 官网首页 | `/` |
| 登录 | `/login` |
| 注册 | `/register` |
| 项目列表 | `/projects` |
| 画布 | `/canvas/:id` |
| 用户账户 | `/account` |
| 后台仪表盘 | `/admin/dashboard` |
| 问答模型 | `/admin/models/chat` |
| 图片模型 | `/admin/models/image` |
| 视频模型 | `/admin/models/video` |
| 错误日志 | `/admin/error-logs` |

## 常见问题

### `vite` 不是内部或外部命令

通常是 devDependencies 没装。重新安装：

```bash
npm install --include=dev --no-audit
```

### 后端启动但页面 404

确认已构建前端：

```bash
npm run build
```

后端只有在 `dist/index.html` 存在且 `SERVE_FRONTEND` 不是 `false` 时才托管前端。

### 登录后无模型可选

检查后台模型是否满足：

- 模型 `is_active=true`
- 模型类型与渠道 `model_type` 一致
- 至少一个绑定关系启用
- 渠道启用且未熔断
- API Key 状态有效

### 图片生成提示余额不足

当前后端对图片模型有最低 1 金币兜底。给用户充值或调整默认余额后再试。

### 生成结果没有文件

服务端会把上游返回的图片或视频转存到本地。如果远程 URL 不可访问、指向内网、MIME 不匹配或文件超限，生成会失败并退款，详细原因可在 `/admin/error-logs` 查看。
