<p align="center">
  <img src="./public/vite.svg" alt="Doodle Canvas" width="120" height="120"/>
</p>

<h1 align="center">🎨 Doodle Canvas</h1>

<p align="center">
  <strong>可视化 AI 创作画布 — 带账号、计费、文件存储和管理后台的全栈平台</strong>
</p>

<p align="center">
  <a href="https://github.com/kggzs/Doodle-Canvas">
    <img src="https://img.shields.io/github/stars/kggzs/Doodle-Canvas?style=for-the-badge&logo=github" alt="GitHub stars"/>
  </a>
  <a href="https://github.com/kggzs/Doodle-Canvas/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License"/>
  </a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=for-the-badge&logo=node.js" alt="Node version"/>
  <img src="https://img.shields.io/badge/vue-3-4FC08D?style=for-the-badge&logo=vuedotjs" alt="Vue 3"/>
  <img src="https://img.shields.io/badge/express-4-000000?style=for-the-badge&logo=express" alt="Express"/>
  <img src="https://img.shields.io/badge/MySQL-8.x-4479A1?style=for-the-badge&logo=mysql" alt="MySQL"/>
  <img src="https://img.shields.io/badge/Redis-6.x-DC382D?style=for-the-badge&logo=redis" alt="Redis"/>
</p>

<p align="center">
  <b>
    <a href="#-能力概览">能力概览</a> •
    <a href="#-快速开始">快速开始</a> •
    <a href="#-项目结构">项目结构</a> •
    <a href="#-部署">部署</a> •
    <a href="#-文档">文档</a>
  </b>
</p>

---

## ✨ 能力概览

> 一个融合 **节点式工作流编排** 与 **多模型 AI 生成** 的全栈创作平台，前端可拖拽连线，后端统一代理模型调用并提供完整的计费与管理系统。

### 🎯 核心功能

| 模块 | 能力 |
|:--- |:--- |
| 🖼️ **可视化画布** | 文本、图片、视频、LLM 配置等节点拖拽编排 |
| 🤖 **AI 工作流** | 文生图、文生图生视频、分镜、多角度分镜、电商产品图、儿童绘本等 |
| 👤 **用户系统** | 邮箱注册/登录、Refresh Token 会话管理、用户状态控制 |
| 🔌 **后端化模型调用** | 前端不存第三方 Key，所有 chat/image/video 走 `/api` |
| ⚙️ **模型与渠道** | 按问答/图片/视频三类维护模型、渠道、轮换策略与计费规则 |
| 🪙 **金币计费** | 余额查询、流水记录、费用预估、生成预扣、失败退款 |
| ☁️ **云端项目** | 项目列表、画布数据、节点与视口自动保存 |
| 📁 **文件存储** | 上传图、生成图、生成视频统一管理，`/storage/*` 访问鉴权 |
| 🔐 **管理后台** | 仪表盘、用户、用户组、金币、生成记录、文件、错误日志、模型配置 |
| 🛡️ **安全防护** | Helmet、CORS、全局限流、Token 类型校验、AES-GCM 加密、SSRF 防护、MIME 校验 |

---

## 🛠️ 技术栈

<p align="center">
  <img src="https://skillicons.dev/icons?i=vue,vite,ts,tailwind,nodejs,express,mysql,redis,nginx,pm2" alt="Tech Stack" />
</p>

| 层级 | 技术 |
|:--- |:--- |
| <img src="https://img.shields.io/badge/-Frontend-42b883" /> **前端** | Vue 3、Vite 5、Vue Router、Pinia、Naive UI、Tailwind CSS、Vue Flow |
| <img src="https://img.shields.io/badge/-Backend-339933" /> **后端** | Node.js、Express、Sequelize、MySQL、Redis、Multer、Sharp、Winston |
| <img src="https://img.shields.io/badge/-DevOps-326CE5" /> **部署** | 单 Node 服务托管 `dist/`、PM2、Nginx 反向代理 |

---

## 🚀 快速开始

### 📋 环境要求

| 依赖 | 版本要求 |
|:--- |:--- |
| **Node.js** | ⩾ 18（推荐 20+） |
| **MySQL** | 8.x 或兼容版本 |
| **Redis** | 6.x 或更高 |
| **包管理** | npm / pnpm |

### ⚡ 起步步骤

<details open>
<summary><b>1️⃣ 安装依赖</b></summary>

```bash
npm install --include=dev --no-audit
npm --prefix server install --include=dev --no-audit
```
</details>

<details open>
<summary><b>2️⃣ 初始化数据库</b></summary>

```bash
mysql -u root -p < server/sql/init.sql
```
</details>

<details open>
<summary><b>3️⃣ 配置后端</b></summary>

```bash
copy server\.env.example server\.env
```

至少填写以下配置项：

| 配置 | 说明 |
|:--- |:--- |
| `DB_HOST` | 数据库地址 |
| `DB_PORT` | 数据库端口 |
| `DB_NAME` | 数据库名称 |
| `DB_USER` | 数据库用户 |
| `DB_PASS` | 数据库密码 |

> 💡 缺少 `JWT_SECRET` 和 `AES_SECRET_KEY` 时，后端会自动生成到 `server/.runtime.env`；请备份该文件且不要提交到版本库。

</details>

<details open>
<summary><b>4️⃣ 启动服务</b></summary>

```bash
npm run dev
```
</details>

<details open>
<summary><b>5️⃣ 创建管理员</b></summary>

```bash
npm run create-admin -- --email admin@example.com --username admin --password Admin123456
```
</details>

### 🌐 访问地址

| 入口 | 地址 |
|:--- |:--- |
| 🏠 **前台首页** | [http://localhost:3000/](http://localhost:3000/) |
| 📂 **项目列表** | [http://localhost:3000/projects](http://localhost:3000/projects) |
| 🔧 **管理后台** | [http://localhost:3000/admin](http://localhost:3000/admin) |
| 💚 **健康检查** | [http://localhost:3000/api/health](http://localhost:3000/api/health) |

---

## 📖 常用命令

| 命令 | 说明 |
|:--- |:--- |
| `npm run dev` | 构建前端 → 启动后端单服务 |
| `npm run build` | 构建前端到 `dist/` |
| `npm run start` | 启动后端，自动托管 `dist/` |
| `npm run server:dev` | 使用 nodemon 启动后端开发服务 |
| `npm run create-admin -- ...` | 创建管理员账号 |
| `npm --prefix server run upgrade-core-features` | 存量数据库升级辅助脚本 |
| `npm --prefix server run backfill-generated-files` | 回填历史生成记录中的外链文件 |

---

## ⚙️ 后台配置模型

模型调用必须先在 **管理后台** 完成配置：

```mermaid
flowchart LR
  A[登录 /admin] --> B[创建渠道]
  B --> C[创建模型]
  C --> D[绑定渠道<br>设置轮换策略]
  D --> E[配置计费规则]
```

### 📌 配置步骤

1. 登录 [`/admin`](http://localhost:3000/admin)
2. 进入 **模型管理** → 选择类型：`chat` / `image` / `video`
3. **创建渠道** — 填写 Provider、Base URL、API 路径、API Key
4. **创建模型** — 填写调用模型名和用户显示名
5. **绑定渠道** — 绑定同类型渠道，可新增线路并设置轮换策略
6. **配置计费规则** — 图片模型后端默认最低消耗 1 金币

### 🔌 支持的 Provider

| Provider | 适用类型 | 默认端点方向 |
|:--- |:--- |:--- |
| `openai` | chat / image / video | OpenAI 兼容接口 |
| `aliyun` | image / video / chat | DashScope / 百炼 |
| `doubao` | image / chat | Volcengine Ark |
| `stepfun` | image / chat | StepFun 兼容接口 |
| `agnes` | chat / image / video | Agnes AI |
| `custom` | chat / image / video | 自定义 OpenAI 兼容接口 |

> 💡 用户侧 `/api/models` 只返回**「模型启用 + 至少一个同类型启用渠道绑定 + 渠道未熔断」**的模型。

---

## 📂 项目结构

<details>
<summary><b>点击展开目录树</b></summary>

```text
📦 Doodle-Canvas
├── 📁 src/                     # 前端源码
│   ├── 📁 api/                 # API 封装层
│   ├── 📁 components/          # 画布节点、边、应用壳组件
│   ├── 📁 config/              # 工作流与默认展示配置
│   ├── 📁 hooks/               # 组合式逻辑 & 工作流编排
│   ├── 📁 router/              # 前台/后台路由与守卫
│   ├── 📁 stores/              # 认证、画布、项目、模型、主题
│   └── 📁 views/               # 首页、画布、账号、管理后台页面
│
├── 📁 server/                  # 后端源码
│   ├── 📁 src/
│   │   ├── 📄 app.js           # Express 入口 & 静态托管
│   │   ├── 📁 routes/          # 用户侧与管理侧 API
│   │   ├── 📁 services/        # 认证、计费、生成、文件等服务
│   │   ├── 📁 models/          # Sequelize 模型
│   │   ├── 📁 middleware/      # 鉴权、限流、审计上下文
│   │   └── 📁 scripts/        # 管理员创建、升级、回填脚本
│   └── 📁 sql/                 # 初始化 & 升级 SQL
│
├── 📁 dist/                    # 构建产物
├── 📄 package.json
└── 📄 README.md
```
</details>

---

## 🔌 API 概览

### 👤 用户侧 API

| 分类 | 端点 |
|:--- |:--- |
| **🔐 认证** | `POST /api/auth/register` · `POST /api/auth/login` · `POST /api/auth/refresh` · `GET /api/auth/me` |
| **📋 模型** | `GET /api/models` · `GET /api/models/:type` · `GET /api/models/detail/:idOrKey` |
| **🎨 生成** | `POST /api/generate/image` · `POST /api/generate/video` · `GET /api/generate/video/:taskId` |
| **💬 对话** | `POST /api/chat/completions` · `POST /api/chat/completions/stream` |
| **🪙 金币** | `GET /api/coins/balance` · `GET /api/coins/summary` · `GET /api/coins/transactions` |
| **💰 计费** | `GET /api/billing/estimate` |
| **📝 记录** | `GET /api/records` · `GET /api/records/:id` |
| **📁 项目** | `GET /api/projects` · `POST /api/projects` · `GET/PUT/DELETE /api/projects/:id` |
| **🗂️ 文件** | `POST /api/upload/image` · `POST /api/upload/video` · `GET /api/files/:id` · `DELETE /api/files/:id` |

### 🔒 管理侧 API

```
/api/admin/dashboard/*       —— 仪表盘
/api/admin/users/*           —— 用户管理
/api/admin/user-groups/*     —— 用户组管理
/api/admin/coins/*           —— 金币管理
/api/admin/models/*          —— 模型配置
/api/admin/channels/*        —— 渠道管理
/api/admin/billing/*         —— 计费规则
/api/admin/records/*         —— 生成记录
/api/admin/files/*           —— 文件管理
/api/admin/error-logs/*      —— 错误日志
```

---

## 🚢 部署

完整部署流程请查看 [📄 DEPLOYMENT.md](./doc/DEPLOYMENT.md)。

> ⚠️ **重要**：新服务器只导入 `server/sql/init.sql`，**不要**叠加执行历史升级脚本。

---

## 📚 文档索引

| 文档 | 说明 |
|:--- |:--- |
| [📚 文档索引](./doc/README.md) | 所有工程文档入口 |
| [🛡️ 代码审计报告](./doc/code-audit-2026-06-21.md) | 当前安全与可靠性审计 |
| [📗 运行指南](./doc/RUN-GUIDE.md) | 本地开发与调试指引 |
| [📘 部署流程](./doc/DEPLOYMENT.md) | 生产环境部署步骤 |
| [📙 服务端架构](./doc/server-design.md) | 后端设计与架构说明 |
| [📊 开发进度](./doc/development-progress.md) | 项目开发进展追踪 |
| [📝 剩余待办](./doc/missing-features.md) | 暂未实现的功能清单 |
| [🗄️ 数据库说明](./doc/database.md) | SQL 初始化与升级说明 |

---

## 📄 License

**MIT** © [kggzs](https://github.com/kggzs)

> 当前仓库未包含独立 `LICENSE` 文件时，以项目发布时附带的许可文件为准。

---

<p align="center">
  <sub>⭐ 如果这个项目对你有帮助，欢迎 Star！</sub>
  <br>
  <sub>Built with ❤️ using Vue 3 & Express</sub>
</p>
