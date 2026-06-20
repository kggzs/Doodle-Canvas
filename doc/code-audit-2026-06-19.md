# Doodle-Canvas 代码审计记录（2026-06-19）

## 审计范围

- 前端：Vue 3 / Vite / Pinia、画布节点、后端 API 调用封装。
- 后端：Express 路由、中间件、认证、模型渠道代理、生成服务、文件存储、项目持久化、计费服务。
- 配置：`package.json`、`server/package.json`、`vite.config.js`、安全相关环境变量默认值。

## 当前结论

项目已从早期“纯前端代理第三方 API”的形态演进为“前端 + 后端代理 + 管理端模型渠道配置”的架构，服务端已经具备基础鉴权、限流、CORS、Helmet、API Key 加密存储和文件软删除机制。本次审计重点关注仍可能造成权限绕过、文件内容伪装、SSRF 绕过和跨用户数据关联的问题。

## 问题清单

### A-01 高危：Refresh Token 可被当作 Access Token 使用

- 位置：`server/src/services/auth.js`、`server/src/middleware/auth.js`
- 现象：Access Token 和 Refresh Token 使用相同 `JWT_SECRET`，payload 中没有 token 类型标记；受保护接口只校验 JWT 签名、过期时间与 `userId`。
- 风险：一旦 Refresh Token 泄露，攻击者可把它放到 `Authorization: Bearer` 里直接访问业务 API，权限有效期从 Access Token 的 15 分钟扩大到 Refresh Token 的 7 天。
- 修复计划：签发 token 时加入 `token_type`，`auth.required` 只接受 `access`，`auth.refreshRequired` 和刷新服务只接受 `refresh`。
- 修复结果：已在 `server/src/services/auth.js` 签发 `token_type`，并在 `server/src/middleware/auth.js` 与刷新服务中强制校验 token 类型。
- 状态：已修复。

### A-02 高危：上传/转存文件过度信任 MIME Header

- 位置：`server/src/services/storage.js`、`server/src/routes/files.js`
- 现象：上传阶段仅检查 `multer` 的 `file.mimetype`；远程转存阶段在无法识别文件魔数时会回退信任 `Content-Type`。
- 风险：攻击者可上传或诱导转存伪装成图片/视频的任意字节，随后通过 `/storage/*` 以图片/视频 MIME 对外提供，带来内容伪装、存储污染和后续解析风险。
- 修复计划：统一用文件魔数识别 PNG/JPEG/WebP/GIF/MP4/WebM；上传、缩略图、生成图片、生成视频均要求内容实际匹配允许类型；为 data URL 与服务端保存增加大小限制。
- 修复结果：已在 `server/src/services/storage.js` 增加真实 MIME 检测、写盘前类型校验和大小限制；保存时使用检测后的安全 MIME 与扩展名。
- 状态：已修复。

### A-03 中危：远程文件转存存在 DNS 重绑定窗口

- 位置：`server/src/services/storage.js`
- 现象：下载远程生成结果前会解析域名并阻断私网地址，但实际 `axios` 请求会再次解析域名。
- 风险：若域名在校验与连接之间发生 DNS 重绑定，仍可能尝试连接内网/本机地址，削弱 SSRF 防护。
- 修复计划：为 HTTP/HTTPS agent 增加安全 `lookup`，在实际连接解析阶段再次阻断私网、环回、链路本地、组播等地址。
- 修复结果：已在 `server/src/services/storage.js` 为远程下载 HTTP/HTTPS agent 增加安全 `lookup`，实际连接解析阶段再次阻断受限地址。
- 状态：已修复。

### A-04 中危：生成记录的 `project_id` 未校验用户归属

- 位置：`server/src/services/generation.js`、`server/src/routes/generate.js`、`server/src/routes/chat.js`
- 现象：前端会随生成请求带上当前 `project_id`，服务端创建生成记录时直接写入 payload 中的项目 ID。
- 风险：用户可提交其他用户项目 ID，导致生成记录/计费元数据产生跨用户项目关联，影响审计、后台查询和后续统计准确性。
- 修复计划：路由层校验 `project_id/projectId` 格式；服务层仅在项目属于当前用户时写入，否则置空。
- 修复结果：已在 `server/src/routes/generate.js`、`server/src/routes/chat.js` 增加项目 ID 格式校验；`server/src/services/generation.js` 仅写入当前用户拥有的项目；`server/src/services/billing.js` 不再把未归属项目 ID 写入计费元数据。
- 状态：已修复。

### A-05 低危：依赖审计命令受镜像源限制

- 位置：本地 npm 配置 / CI 配置
- 现象：`npm audit --omit=dev --json` 请求 `https://registry.npmmirror.com/-/npm/v1/security/advisories/bulk` 返回 404，当前镜像源不支持 npm 安全审计接口。
- 风险：安全审计流程无法稳定获得依赖漏洞结果。
- 修复计划：测试阶段改用官方 registry 运行一次审计，文档记录结果；长期建议在 CI 固定审计 registry。
- 验证结果：已使用 `https://registry.npmjs.org/` 分别审计根项目与 `server`，生产依赖漏洞数均为 0。
- 状态：已验证。

## 修复与验证记录

### 已修改文件

- `server/src/services/auth.js`：签发 Access/Refresh Token 时加入 `token_type`；刷新服务拒绝非 refresh token。
- `server/src/middleware/auth.js`：登录态接口只接受 access token，可选鉴权忽略非 access token，刷新鉴权只接受 refresh token。
- `server/src/services/storage.js`：新增安全 DNS lookup、真实 MIME 检测、文件大小限制与写盘前校验。
- `server/src/services/generation.js`：生成记录写入项目前先校验项目归属。
- `server/src/services/billing.js`：计费元数据只记录当前用户拥有的项目。
- `server/src/routes/generate.js`、`server/src/routes/chat.js`：新增 `project_id/projectId` UUID 校验。

### 验证命令

- `git diff --check`：通过，仅有 Git 行尾转换提示。
- `node --check server/src/middleware/auth.js`：通过。
- `node --check server/src/services/auth.js`：通过。
- `node --check server/src/services/storage.js`：通过。
- `node --check server/src/services/generation.js`：通过。
- `node --check server/src/services/billing.js`：通过。
- `node --check server/src/routes/chat.js`：通过。
- `node --check server/src/routes/generate.js`：通过。
- `node -e "import('./server/src/middleware/auth.js')..."`：通过。
- `node -e "import('./server/src/services/storage.js')..."`：通过。
- `node -e "import('./server/src/services/generation.js')..."`：通过。
- `npm run build`：通过，Vite 生产构建成功。
- `npm audit --omit=dev --json`（官方 registry，根项目）：0 个漏洞。
- `npm audit --omit=dev --json`（官方 registry，`server`）：0 个漏洞。

### 备注

- 仓库当前没有专用 `test` 脚本；本次以语法检查、模块导入检查、生产构建和依赖审计作为验证闭环。
- 直接使用当前 npm 镜像 `npmmirror` 执行 `npm audit` 会因为镜像不支持安全审计接口返回 404；本次已用官方 registry 完成审计。
- 新 token 类型校验会让旧的未带 `token_type` 的存量 token 失效，用户需要重新登录。
