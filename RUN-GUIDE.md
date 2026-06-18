# AI Canvas 项目运行指南

## 项目简介

**AI Canvas（万能涂鸦画布）** 是一个基于 Vue 3 + Vite 的可视化 AI 创作画布，支持文生图、视频生成等 AI 工作流的节点式编排。

---

## 环境要求

| 依赖 | 版本要求 |
|------|---------|
| **Node.js** | >= 18.0.0（推荐 v20+） |
| **npm** | >= 9.0.0（推荐最新版） |
| **pnpm**（可选） | >= 8.0.0（推荐使用） |

> 当前验证环境：Node.js v24.15.0 / npm 11.12.1

---

## 安装与运行步骤

### 1. 克隆项目

```bash
git clone https://github.com/kggzs/Doodle-Canvas.git
cd Doodle-Canvas
```

### 2. 安装依赖

**推荐使用 pnpm：**

```bash
pnpm install
```

**或使用 npm：**

```bash
npm install --include=dev --no-audit
```

后端依赖需要在 `server/` 目录单独安装：

```bash
cd server
npm install --include=dev --no-audit
cd ..
```

> **注意：** 如果你的 npm 版本 >= 9 且设置了 `include=prod`（部分新版本默认行为），需要显式添加 `--include=dev` 参数来安装 devDependencies（如 vite、tailwindcss 等），否则项目无法启动。

### 3. 启动开发服务器

**pnpm：**

```bash
pnpm dev
```

**npm：**

```bash
npm run dev
```

启动成功后，终端会输出：

```
VITE v5.4.21  ready in xxx ms

➜  Local:   http://localhost:5173/huobao-canvas
➜  Network: use --host to expose
```

在浏览器中打开 **http://localhost:5173/huobao-canvas** 即可访问。

> 如果 5173 端口被占用，Vite 会自动尝试下一个可用端口（如 5174）。

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` / `npm run dev` | 启动 Vite 开发服务器（热更新） |
| `pnpm build` / `npm run build` | 生产环境构建，输出到 `dist/` 目录 |
| `npm run start` | 启动后端服务，并托管已构建的前端页面 |
| `npm run server:dev` | 启动后端开发服务 |
| `pnpm preview` / `npm run preview` | 预览构建后的产物 |

---

## 单服务部署

当前项目支持“只跑一个 Node 服务”：

```bash
# 1. 构建前端 dist/
npm run build

# 2. 启动后端，Express 会同时提供 /api 与 /huobao-canvas
npm run start
```

访问地址：

- 前端页面：http://localhost:3000/huobao-canvas
- 登录页面：http://localhost:3000/huobao-canvas/login
- 管理后台：http://localhost:3000/huobao-canvas/admin/users
- 用户组管理：http://localhost:3000/huobao-canvas/admin/user-groups
- 金币流水：http://localhost:3000/huobao-canvas/admin/coins
- 渠道地址池：http://localhost:3000/huobao-canvas/admin/channels
- 模型配置：http://localhost:3000/huobao-canvas/admin/models
- 后端健康检查：http://localhost:3000/api/health

首次部署可创建管理员账号：

```bash
npm run create-admin -- --email admin@example.com --username admin --password Admin123456
```

后端静态托管由 `server/.env` 控制：

```env
SERVE_FRONTEND=true
FRONTEND_BASE=/huobao-canvas
FRONTEND_DIST_DIR=../../dist
```

只要 `dist/index.html` 存在，后端启动后会自动托管前端构建产物。

---

## 常见问题排查

### 1. `'vite' 不是内部或外部命令`

**原因：** devDependencies 未正确安装。

**解决方法：**

```bash
# 清理后重新安装
rmdir /s /q node_modules        # Windows
rm -rf node_modules              # Linux/Mac
del package-lock.json           # Windows
rm package-lock.json            # Linux/Mac

npm install --include=dev --no-audit
```

### 2. 端口被占用

Vite 会自动切换到下一个可用端口。如需指定端口：

```bash
npx vite --port 3000
```

或在 `vite.config.js` 中配置：

```js
export default defineConfig({
  server: {
    port: 3000
  }
})
```

### 3. npm audit 报错（使用 npmmirror 镜像时）

如果使用淘宝镜像（`registry.npmmirror.com`），安全审计接口可能返回 404，可跳过审计：

```bash
npm install --no-audit
```

### 4. pnpm 未安装

如需使用 pnpm 但未安装，可通过以下方式安装：

```bash
npm install -g pnpm
```

---

## API 配置

旧版为纯前端配置。后端化后，API Key / Base URL 应统一在管理后台维护：

1. 进入 `/huobao-canvas/admin/channels` 创建渠道地址，填写 Provider、Base URL、API Key。
2. 进入 `/huobao-canvas/admin/models` 创建 image / video / chat 模型。
3. 在模型详情的“渠道绑定”中，把模型绑定到一个或多个渠道，并设置轮换权重与策略。

普通用户页面不再显示 API Key 设置入口。

支持的 AI 服务商：
- **OpenAI**（及兼容接口）
- **阿里云万相**（DashScope）
- **豆包**（Volcengine Ark / Seedream）

生成请求会统一走后端 `/api/generate/*` 与 `/api/chat/*`，前端不会保存或发送第三方 API Key。

---

## Docker 部署（可选）

```bash
# 1. 先构建前端
npm run build

# 2. 构建 Docker 镜像
docker build -t huobao-canvas .

# 3. 运行容器
docker run -d -p 8080:80 huobao-canvas
```

访问 **http://localhost:8080/huobao-canvas**。
