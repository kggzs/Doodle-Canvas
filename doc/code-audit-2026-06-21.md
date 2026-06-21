# 代码审计报告

审计日期：2026-06-21  
审计范围：前端 `src/`、后端 `server/src/`、SQL 初始化与升级脚本、运行/部署配置。  
审计方式：源码阅读、关键风险点检索、依赖审计、生产构建验证。

## 结论摘要

项目整体安全基线较完整：认证链路使用 JWT 类型校验、Refresh Token 哈希存储与轮换；上传与远程转存具备 MIME 嗅探、大小限制、路径归一化与 SSRF 防护；模型渠道 API Key 采用 AES-256-GCM 加密存储；管理端路由统一挂载登录与 admin 角色中间件。

当前主要风险集中在会话存储、文件访问授权、生产密钥管理、异步生成任务可靠性与生产级可观测性。未发现明显 SQL 注入、任意文件读取、服务端命令执行或第三方 API Key 明文返回问题。

## 已验证结果

| 检查项 | 结果 |
| --- | --- |
| `npm run build` | 通过 |
| 前端依赖审计 | 0 vulnerabilities |
| 后端依赖审计 | 0 vulnerabilities |
| 默认 npm audit registry | `npmmirror` 不支持 audit 接口，已改用官方 npm registry 验证 |

## 主要风险

### 高风险：Refresh Token 存储在 localStorage 且默认有效期过长

位置：
- `src/utils/backend.js:7`
- `src/utils/backend.js:78`
- `src/utils/backend.js:81`
- `server/src/config/auth.js:25`

前端将 access token、refresh token 与用户信息存储在 `localStorage`，后端默认 Refresh Token 有效期为 `3650d`。一旦前端出现 XSS、浏览器扩展污染或同机恶意脚本，长期 refresh token 会显著放大账号接管窗口。

建议：
- 生产环境将 Refresh Token 改为 `HttpOnly + Secure + SameSite` Cookie。
- 将默认刷新令牌有效期缩短到 7-30 天，并保留当前的刷新轮换策略。
- 前端保留 access token 时优先使用内存态；必要时配合页面刷新后的静默刷新。
- 对异常登录设备增加会话撤销与强制下线入口。

### 中高风险：`/storage/*` 文件链接只校验状态，不校验请求用户

位置：
- `server/src/app.js:139`
- `server/src/app.js:144`
- `server/src/services/storage.js:433`

文件访问通过 `storagePath` 查询 `files` 表状态，状态为 active 即可公开访问，并且响应头允许 `Access-Control-Allow-Origin: *`。这适合公开素材或生成结果，但如果上传图、生成图、视频、草稿项目内容属于用户私有数据，任何拿到链接的人都能访问。

建议：
- 明确文件隐私模型：公开作品、私有上传、管理端文件分别建模。
- 私有文件使用鉴权接口或短时签名 URL。
- 管理端文件预览与用户文件下载分开处理，避免所有 active 文件天然公开。
- 对生成结果返回的文件 URL 标记可见性，便于前端区分分享与私有使用。

### 中风险：生产密钥会自动生成到 `.runtime.env`

位置：
- `server/src/config/runtime-env.js:91`
- `server/src/config/runtime-env.js:110`
- `server/src/config/runtime-env.js:114`
- `server/src/app.js:245`

缺少 `JWT_SECRET` 或 `AES_SECRET_KEY` 时，服务会自动生成并写入 `server/.runtime.env`。这提升了本地体验，但生产环境如果没有明确托管密钥，文件丢失会导致历史 JWT 失效、渠道 API Key 无法解密，也不利于多实例一致性。

建议：
- 生产环境要求显式配置 `JWT_SECRET` 与 `AES_SECRET_KEY`，启动时缺失直接失败。
- 将 `.runtime.env` 作为开发兜底，不作为生产密钥来源。
- 用平台 Secret Manager、Docker/K8s Secret 或 PM2 ecosystem 环境变量管理。
- 记录密钥轮换流程，API Key 加密密钥轮换要有迁移脚本。

### 中风险：后台图片生成使用 `setImmediate`，缺少持久队列与并发控制

位置：
- `server/src/services/generation.js:1411`
- `server/src/services/generation.js:1414`

后台图片任务直接用 `setImmediate` 执行。进程重启会丢失正在执行的任务，瞬时大量请求会占用上游连接、内存和金币计费链路，缺少统一重试、超时回收、并发上限与任务状态机。

建议：
- 引入 Redis 队列或 BullMQ，按模型类型设置并发。
- 任务状态入库，支持 pending、processing、completed、failed、cancelled。
- 生成任务和转存任务分阶段记录，失败可重试且退款只执行一次。
- 管理后台增加队列深度、失败原因和重试入口。

### 中风险：生产 CSP 较宽，降低了 XSS 后的阻断能力

位置：
- `server/src/app.js:68`
- `server/src/app.js:70`

当前 `imgSrc`、`mediaSrc`、`connectSrc` 允许任意 `http:`、`https:`，`styleSrc` 允许 `unsafe-inline`。这对 AI 生成结果和第三方上游兼容友好，但生产环境出现 XSS 时，数据外传与恶意连接更容易成功。

建议：
- 生产环境按实际模型网关、CDN、对象存储域名收紧 CSP。
- 使用 nonce/hash 替代广泛 `unsafe-inline`。
- 区分开发和生产 CSP 配置，开发保留宽松策略，生产使用白名单。

### 中风险：生产数据库/Redis 连接失败时服务仍启动

位置：
- `server/src/config/database.js:53`
- `server/src/config/database.js:59`
- `server/src/app.js:252`

数据库和 Redis 连接测试失败时只记录警告，不阻断服务启动。开发环境可接受，但生产负载均衡健康检查可能认为服务可用，实际业务接口会持续失败。

建议：
- 增加 `/api/ready`，检查 MySQL、Redis、存储目录可写性。
- 生产环境配置 `STARTUP_DEPENDENCY_MODE=fail-fast`，关键依赖失败直接退出。
- 保留 `/api/health` 作为进程存活检查，避免与业务就绪混淆。

### 低到中风险：管理端渠道连通性测试可请求任意渠道地址

位置：
- `server/src/services/model-management.js:276`
- `server/src/services/model-management.js:282`

`testChannel` 会请求管理员配置的 `apiBaseUrl`，没有复用存储模块的私网地址拦截。虽然接口仅 admin 可用，但在多管理员、低信任后台或账号被盗场景下，可能被用于探测内网服务。

建议：
- 对渠道 Base URL 也做协议、主机、私网地址校验。
- 生产环境提供上游域名 allowlist。
- 测试渠道时避免把真实 API Key 发往未验证的地址。

## 安全基线亮点

| 模块 | 已有防护 |
| --- | --- |
| 认证 | Access/Refresh Token 类型校验、Refresh Token 哈希入库、刷新轮换、Redis 与本地黑名单 |
| 密码 | bcrypt cost=12，密码强度要求，重置密码后撤销 refresh tokens |
| 邮箱验证码 | 验证码 bcrypt 哈希存储、过期时间、尝试次数限制 |
| 上传/转存 | 文件大小限制、内容 MIME 嗅探、路径归一化、远程 URL SSRF 防护、私网 IP 拦截 |
| 模型渠道 | API Key 不返回明文或密文，AES-GCM 随机 IV 加密 |
| SQL | 主要使用 Sequelize 条件和 replacements，未发现直接拼接用户输入的查询 |
| 管理端 | `/api/admin/*` 统一挂载登录和 admin 角色检查 |
| 计费 | 用户维度锁、余额不足保护、失败退款链路 |

## 测试缺口

当前仓库没有单元测试、集成测试或 lint 脚本。建议优先补齐：

1. 认证：注册、邮箱验证、登录锁定、刷新令牌轮换、登出黑名单。
2. 文件：上传 MIME 嗅探、远程 URL SSRF 拦截、软删除后不可访问。
3. 计费：余额不足、生成失败退款、重复退款保护、用户组倍率。
4. 生成：上游 4xx/5xx、超时、转存失败、视频任务跨用户查询。
5. 管理：admin 权限边界、模型渠道密钥不泄露、用户禁用/封禁状态。

## 优先级建议

| 优先级 | 事项 |
| --- | --- |
| P0 | 缩短 Refresh Token 默认有效期，规划 HttpOnly Cookie 迁移 |
| P0 | 明确文件公开/私有策略，为私有文件增加鉴权或签名 URL |
| P1 | 生产环境显式密钥配置与 fail-fast 启动策略 |
| P1 | 引入生成任务队列与并发控制 |
| P2 | 收紧生产 CSP 和渠道 URL 校验 |
| P2 | 增加自动化测试与 CI 检查 |

