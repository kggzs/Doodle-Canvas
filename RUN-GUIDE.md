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
git clone https://github.com/kggzs/doodle-canvas.git
cd doodle-canvas
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
| `pnpm preview` / `npm run preview` | 预览构建后的产物 |

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

本项目为纯前端应用，API Key 和 Base URL **无需在环境变量中配置**，而是在应用 UI 界面中设置后自动存储到浏览器 localStorage 中。

支持的 AI 服务商：
- **OpenAI**（及兼容接口）
- **阿里云万相**（DashScope）

在页面右上角的设置按钮中进入 API 配置面板。

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
