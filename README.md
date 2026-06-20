# Doodle-Canvas

Doodle-Canvas 是一个带账号、计费、文件存储和管理后台的可视化 AI 创作画布。前端使用 Vue 3 + Vue Flow 呈现节点式工作区，后端使用 Express + MySQL + Redis 统一代理模型调用、保存生成记录并管理 API Key。

项目地址：https://github.com/kggzs/Doodle-Canvas

## 当前能力

- 可视化画布：文本、图片配置、图片、视频配置、视频、LLM 配置等节点。
- 自动工作流：文生图、文生图生视频、分镜、多角度分镜、电商产品图、儿童绘本等模板。
- 用户系统：邮箱注册、登录、Refresh Token、会话管理、用户状态控制。
- 后端化模型调用：前端不保存第三方 API Key，所有 chat/image/video 请求走 `/api`。
- 模型与渠道：后台按问答、图片、视频三类维护模型、渠道、API 路径、Key、轮换策略和计费规则。
- 金币计费：余额、流水、费用预估、生成预扣、失败退款。
- 云端项目：项目列表、画布数据、节点和视口保存到服务端。
- 文件存储：上传图、生成图、生成视频写入本地存储，`/storage/*` 访问前校验数据库状态。
- 管理后台：仪表盘、用户、用户组、金币、生成记录、文件、错误日志、三类模型配置。
- 安全防护：Helmet、CORS、全局 API 限流、Access/Refresh Token 类型校验、API Key AES-GCM 加密、远程文件转存 SSRF 防护、真实 MIME 校验。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Vue 3、Vite 5、Vue Router、Pinia、Naive UI、Tailwind CSS、Vue Flow |
| 后端 | Node.js、Express、Sequelize、MySQL、Redis、Multer、Sharp、Winston |
| 部署 | 单 Node 服务托管 `dist/`、PM2、Nginx 反向代理 |

## 快速开始

环境要求：

- Node.js 18 或更高，推荐 Node.js 20+
- MySQL 8.x 或兼容版本
- Redis 6.x 或更高
- npm 或 pnpm

安装依赖：

```bash
npm install --include=dev --no-audit
npm --prefix server install --include=dev --no-audit
```

初始化数据库：

```bash
mysql -u root -p < server/sql/init.sql
```

复制并修改后端配置：

```bash
copy server\.env.example server\.env
```

至少填写 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASS`。开发环境缺少 `JWT_SECRET` 和 `AES_SECRET_KEY` 时，后端会自动生成到 `server/.runtime.env`；生产环境建议显式配置强密钥。

构建前端并启动单服务：

```bash
npm run dev
```

访问地址：

- 前台首页：http://localhost:3000/
- 项目列表：http://localhost:3000/projects
- 管理后台：http://localhost:3000/admin
- 健康检查：http://localhost:3000/api/health

创建管理员：

```bash
npm run create-admin -- --email admin@example.com --username admin --password Admin123456
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 执行 `npm run serve`，先构建前端再启动后端单服务 |
| `npm run build` | 构建前端到 `dist/` |
| `npm run start` | 启动后端，自动托管已有 `dist/` |
| `npm run server:dev` | 使用 nodemon 启动后端开发服务 |
| `npm run create-admin -- ...` | 创建管理员账号 |
| `npm --prefix server run upgrade-core-features` | 存量数据库升级辅助脚本 |
| `npm --prefix server run backfill-generated-files` | 回填历史生成记录中的外链文件 |

## 后台配置模型

模型调用必须先在后台完成配置：

1. 登录 `/admin`。
2. 进入 `/admin/models/chat`、`/admin/models/image` 或 `/admin/models/video`。
3. 创建对应类型的渠道，填写 Provider、Base URL、API 路径、API Key。
4. 创建模型，填写调用模型名和用户显示名。
5. 绑定同类型渠道，可继续新增线路并设置轮换策略。
6. 配置计费规则。图片模型后端默认最低消耗 1 金币。

当前支持的 Provider 类型：

| Provider | 适用类型 | 默认端点方向 |
| --- | --- | --- |
| `openai` | chat/image/video | OpenAI 兼容接口 |
| `aliyun` | image/video/chat | DashScope / 百炼 |
| `doubao` | image/chat | Volcengine Ark |
| `stepfun` | image/chat | StepFun 兼容接口 |
| `agnes` | chat/image/video | Agnes AI |
| `custom` | chat/image/video | 自定义 OpenAI 兼容接口 |

用户侧 `/api/models` 只返回“模型启用 + 至少一个同类型启用渠道绑定 + 渠道未熔断”的模型。

## 项目结构

```text
src/
  api/              前端 API 封装
  components/       画布节点、边、应用壳组件
  config/           前端工作流和默认展示配置
  hooks/            组合式逻辑和工作流编排
  router/           前台、后台路由和守卫
  stores/           认证、画布、项目、模型、主题状态
  views/            首页、画布、账号、管理后台页面

server/
  src/app.js        Express 入口和静态托管
  src/routes/       用户侧与管理侧 API
  src/services/     认证、计费、生成、文件、项目、记录等服务
  src/models/       Sequelize 模型
  src/middleware/   鉴权、限流、审计上下文
  src/scripts/      管理员创建、升级、回填脚本
  sql/              初始化和升级 SQL
```

## 关键 API

用户侧：

- `POST /api/auth/register`、`POST /api/auth/login`、`POST /api/auth/refresh`、`GET /api/auth/me`
- `GET /api/models`、`GET /api/models/:type`、`GET /api/models/detail/:idOrKey`
- `POST /api/generate/image`、`POST /api/generate/video`、`GET /api/generate/video/:taskId`
- `POST /api/chat/completions`、`POST /api/chat/completions/stream`
- `GET /api/coins/balance`、`GET /api/coins/summary`、`GET /api/coins/transactions`
- `GET /api/billing/estimate`
- `GET /api/records`、`GET /api/records/:id`
- `GET /api/projects`、`POST /api/projects`、`GET/PUT/DELETE /api/projects/:id`
- `POST /api/upload/image`、`GET /api/files/:id`、`DELETE /api/files/:id`

管理侧：

- `/api/admin/dashboard/*`
- `/api/admin/users/*`
- `/api/admin/user-groups/*`
- `/api/admin/coins/*`
- `/api/admin/models/*`
- `/api/admin/channels/*`
- `/api/admin/billing/*`
- `/api/admin/records/*`
- `/api/admin/files/*`
- `/api/admin/error-logs/*`

## 部署

完整部署流程见 [DEPLOYMENT.md](./DEPLOYMENT.md)。新服务器只导入 `server/sql/init.sql`，不要叠加执行历史升级脚本。

## 文档索引

- [运行指南](./RUN-GUIDE.md)
- [部署流程](./DEPLOYMENT.md)
- [服务端架构](./doc/server-design.md)
- [开发进度](./doc/development-progress.md)
- [剩余待办](./doc/missing-features.md)
- [数据库脚本说明](./server/sql/README.md)

## License

MIT。当前仓库未包含独立 `LICENSE` 文件时，以项目发布时附带的许可文件为准。
