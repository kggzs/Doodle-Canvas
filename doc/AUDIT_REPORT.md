# 代码审计报告：huobao-canvas (AI Canvas)

> 审计时间：2026-06-16
> 审计范围：`src/` 全量源码 + 构建配置 + Docker/nginx 部署
> 技术栈：Vue 3.5 + Vite 5 + Vue Flow + Pinia + Naive UI + Tailwind + axios

## 状态总览

| 优先级 | 问题数 | 已修复 | 待修复 |
|--------|--------|--------|--------|
| P0（严重） | 4 | **4** ✅ | 0 |
| P1（中等） | 6 | **6** ✅ | 0 |
| P2（优化） | 6 | 0 | 6（记录待迭代） |

**修复进度**：✅ P0 / P1 全部完成，`npm run build` 构建验证通过。

---

## P0 — 严重问题（安全 / 功能阻断）

### P0-1 LLMConfigNode 存储型 XSS（未转义 innerHTML）✅
- **位置**：`src/components/nodes/LLMConfigNode.vue:472`
- **问题**：`editor.innerHTML = systemPrompt.value.replace(/\n/g, '<br>')` 将用户在「系统提示词」输入的**纯文本**直接作为 HTML 注入，完全无转义。输入 `<img src=x onerror=alert(1)>` 即可执行。因提示词持久化到 localStorage，构成**存储型 XSS**，可窃取同源明文存储的 API Key。
- **修复**：改为用 DOM API 安全重建内容（`replaceChildren()` + `createTextNode` + `createElement('br')`），不再把用户输入当 HTML 字符串解析。
- **状态**：✅ 已修复

### P0-2 TextNode editorHtml 属性逃逸 XSS ✅
- **位置**：`src/components/nodes/TextNode.vue:414-433`
- **问题**：`editorHtml` 计算属性虽对正文做了 `&<>` 转义，但拼接进 `src`/`alt` 的 `node.data.url`（可来自 URL 输入框，仅校验 http(s) 前缀）与 `displayName` 未转义，构造 `https://evil" onerror="alert(1)` 即可逃逸属性。该 HTML 经 `editor.innerHTML = editorHtml.value` 注入。
- **修复**：新增 `escapeHtmlAttr` 辅助函数（转义 `& " ' < >`），对插入到 HTML 字符串中的 `nodeId`/`url`/`displayName` 统一属性级转义。
- **状态**：✅ 已修复

### P0-3 pinia/models.js `removeStored` 未定义（ReferenceError）✅
- **位置**：`src/stores/pinia/models.js:117-120`
- **问题**：`clearProvider()` 调用 `removeStored()`，但该文件只定义了 `getStored/setStored/getStoredJson/setStoredJson`，**没有 `removeStored`**。任何触发「清除渠道」的调用都会抛 `ReferenceError`，清空流程崩溃。
- **修复**：在文件中补全 `removeStored(key)` 函数（含 try/catch）。
- **状态**：✅ 已修复

### P0-4 全局消息提示失效（window.$message 从未挂载）✅
- **位置**：`src/App.vue`
- **问题**：全项目大量使用 `window.$message?.xxx`，但 `App.vue` 只放了 `<n-message-provider>`，**从未调用 `useMessage()` 并赋值给 `window.$message`**。所有错误/成功/警告提示都是 no-op，用户看不到任何反馈（例如 API Key 错误、生成失败等）。
- **修复**：新增 `GlobalApiBridge` 内部组件，在 Naive UI provider 内部调用 `useMessage()`/`useDialog()` 并挂载到 `window.$message`/`window.$dialog`；同时补上 `NLoadingBarProvider`。
- **状态**：✅ 已修复

---

## P1 — 中等问题

### P1-1 getVideoTaskStatus 形同虚设的 taskId 参数 ✅
- **位置**：`src/api/video.js:41-47`
- **问题**：函数接收 `taskId` 却不使用，默认 endpoint `/videos` 无占位符，非阿里云调用方会查询错误端点。
- **修复**：函数内部统一处理 `{taskId}` 占位符替换；不含占位符时按 `${endpoint}/${taskId}` 拼接。同步简化 `hooks/useApi.js` 调用方（移除冗余的预替换逻辑，交由函数自身处理）。
- **状态**：✅ 已修复

### P1-2 axios timeout 异常值 ✅
- **位置**：`src/utils/request.js:13`
- **问题**：`timeout: 30000000`（≈8.3 小时），疑似多写一个 0，应为 `300000`（5 分钟）。挂起请求会长期占用。
- **修复**：改为 `timeout: 300000`。
- **状态**：✅ 已修复

### P1-3 streamChatCompletions 非 JSON 错误处理崩溃 ✅
- **位置**：`src/api/chat.js:44-47`
- **问题**：`await response.json()` 在上游返回非 JSON（如 HTML 错误页、502）时抛 SyntaxError，丢失真实状态码。
- **修复**：改为先 `response.text()` 再尝试 `JSON.parse`，失败时降级展示文本错误片段并保留 HTTP 状态码。
- **状态**：✅ 已修复

### P1-4 Canvas.vue 删除/复制项目功能缺失 ✅
- **位置**：`src/views/Canvas.vue`
- **问题**：`confirmDelete` 把 `deleteProject(projectId)` 注释掉了（删除按钮无实际效果）；「复制」是占位 toast「开发中」。
- **修复**：导入并启用 `deleteProject`/`duplicateProject`；实现 `duplicateCurrentProject`（先保存当前画布再复制并跳转副本）。
- **状态**：✅ 已修复

### P1-5 nginx 代理缺失阿里云路由 + 调试文件入仓 ✅
- **位置**：`nginx.conf`、`.gitignore`
- **问题**：Vite dev 代理 `/services`、`/tasks`（阿里云万相）在生产 nginx 中**没有对应 proxy_pass**，生产部署阿里云会失败。另 `报错.txt` 等调试文件已提交。
- **修复**：在 `nginx.conf` 补全 `/services`、`/tasks` 到 `dashscope.aliyuncs.com/api/v1/*` 的反代（含 Host 头与 SSL SNI）；`.gitignore` 增加调试日志/本地笔记规则。
- **状态**：✅ 已修复（已跟踪的 md 笔记未擅自删除，仅加忽略规则防止未来误提交）

### P1-6 window.__aiCanvasProjects 调试后门 ✅
- **位置**：`src/stores/projects.js:370-378`
- **问题**：把 projects store 挂到 `window`，生产构建未守卫，暴露内部状态。
- **修复**：加 `import.meta.env.DEV` 守卫，仅开发环境挂载。
- **状态**：✅ 已修复

---

## P2 — 架构与优化（记录待迭代，本次未改动）

### P2-1 API Key 明文存储于 localStorage
- `stores/pinia/models.js` 等把各渠道 Key 明文写入 `api-keys-by-provider`。结合 P0 XSS（已修复）可被窃取。建议 README 明示风险或加密。

### P2-2 `document.execCommand` 已废弃
- `TextNode.vue:400/565`、`LLMConfigNode.vue:369/449` 使用废弃 API，建议迁移到 Selection/InputEvent。

### P2-3 双套并行的状态管理（技术债核心）
- `hooks/useModelConfig.js` + `hooks/useProvider.js` + `hooks/useApiConfig.js` 与 `stores/pinia/models.js` 字段/逻辑高度重复，组件混用易不同步。建议统一到 Pinia。

### P2-4 module-level ref + watch 无 onScopeDispose
- `useApiConfig.js`、`useModelConfig.js`、`useProvider.js` 在 setup 内对 module-level ref 创建 watch 但不停止，多次调用累积 watch。

### P2-5 历史记录全量深拷贝性能
- `stores/canvas.js` 每次 `saveToHistory` 用 `JSON.parse(JSON.stringify(...))`，`MAX_HISTORY=50`，密集操作可能卡顿。建议改结构化快照/diff。

### P2-6 开发日志 + 大段死代码
- DEV 日志散落多处；多个组件保留注释掉的预览代码、未使用 import（`ExpandOutline`、`ColorWandOutline` 等）。

---

## 本次变更文件清单

| 文件 | 变更内容 |
|------|----------|
| `src/App.vue` | 新增 GlobalApiBridge，挂载 window.$message/$dialog，补 LoadingBarProvider |
| `src/components/nodes/LLMConfigNode.vue` | P0-1 XSS：DOM 安全重建编辑器内容 |
| `src/components/nodes/TextNode.vue` | P0-2 XSS：editorHtml 属性级转义 |
| `src/stores/pinia/models.js` | P0-3 补全 removeStored 函数 |
| `src/api/video.js` | P1-1 getVideoTaskStatus 实际使用 taskId |
| `src/hooks/useApi.js` | P1-1 简化轮询调用（移除冗余替换） |
| `src/utils/request.js` | P1-2 timeout 30000000 → 300000 |
| `src/api/chat.js` | P1-3 stream 错误响应安全解析 |
| `src/views/Canvas.vue` | P1-4 启用删除/复制项目功能 |
| `nginx.conf` | P1-5 补全阿里云 /services /tasks 反代 |
| `.gitignore` | P1-5 增加调试文件忽略规则 |
| `src/stores/projects.js` | P1-6 调试后门加 DEV 守卫 |

**验证**：`npm run build` 通过，4254 模块转换成功，无错误/警告。

---

## 备注

- P2 类为架构性优化，风险可控，建议后续迭代处理，其中 P2-3（状态管理统一）影响面最大，建议优先规划。
- P0-4 修复后，此前所有「静默失败」的场景现在会正确弹出提示，用户体验有显著改善。
- 如需进一步加固，可考虑：API Key 加密存储、CSP 头、`execCommand` 迁移。
