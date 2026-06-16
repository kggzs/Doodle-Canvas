# 🔍 代码审计报告 — Doodle-Canvas / 万能涂鸦画布

> **审计日期**: 2026-06-16  
> **项目类型**: Vue 3 纯前端 SPA（无后端服务层）  
> **源码规模**: 50+ 文件 / ~8500 行  
> **审计范围**: 全部源码、构建配置、部署配置、依赖清单  
> **审计方式**: 逐文件阅读审查

---

## 目录

- [1. 项目概述](#1-项目概述)
- [2. 严重等级说明](#2-严重等级说明)
- [3. 安全审计](#3-安全审计)
- [4. 性能审计](#4-性能审计)
- [5. 代码质量与架构审计](#5-代码质量与架构审计)
- [6. Bug 风险分析](#6-bug-风险分析)
- [7. 依赖审计](#7-依赖审计)
- [8. 改进建议汇总](#8-改进建议汇总)

---

## 1. 项目概述

| 维度 | 详情 |
|------|------|
| 技术栈 | Vue 3 (Composition API) + Vite 5 + Pinia 3 + Vue Flow + Naive UI + Tailwind CSS |
| 用途 | AI 创意画布——通过节点编排工作流，调用多种 AI 提供商生成图片和视频 |
| 后端 | 无——纯前端应用，通过 Vite dev proxy 或 nginx production proxy 代理到第三方 AI API |
| 存储 | `localStorage`（配置 / 项目数据）+ `IndexedDB`（图片缓存） |
| AI 提供商 | OpenAI 兼容接口 / 阿里云万相 (DashScope) / 豆包 (Doubao) |
| 部署方式 | 静态文件部署（nginx），API 请求通过反向代理转发 |

### 核心文件结构

```
src/
├── api/              # API 调用层（chat, image, video）
├── components/       # UI 组件（节点、边、设置面板、工作流面板）
├── config/           # 配置（模型定义、渠道适配、工作流模板）
├── hooks/            # 组合式函数（状态逻辑、API 操作、工作流编排）
├── stores/           # 状态管理（canvas、projects、theme、pinia store）
├── utils/            # 工具函数（请求封装、常量、缓存、schema）
└── views/            # 页面（Home、Canvas）
```

---

## 2. 严重等级说明

| 等级 | 标识 | 说明 |
|------|------|------|
| 严重 | 🔴 | 可能导致数据泄露、数据丢失或架构性缺陷 |
| 高危 | 🟠 | 存在安全风险或影响核心功能稳定性 |
| 中等 | 🟡 | 代码质量问题或非关键风险 |
| 低危 | 🔵 | 轻微问题或建议 |

---

## 3. 安全审计

### 🔴 [S-1] API Key 明文存储于 localStorage

**位置**: `src/stores/pinia/models.js:176-178`、`src/utils/constants.js:50-58` 及所有 localStorage 读写处

**问题描述**:  
所有 API Key 以明文 JSON 字符串存储在 `localStorage` 中。键名包括 `apiKey`、`api-keys-by-provider`、`service-api-keys` 等。

```js
// stores/pinia/models.js:193
const setApiKeyByProvider = (provider, apiKey) => {
  apiKeysByProvider.value[provider] = apiKey  // ↔ 写入 localStorage（明文）
}
```

**风险分析**:
- 同源 XSS 攻击可直接窃取所有 API Key
- `localStorage` 不会自动过期，页面关闭后仍持久存在
- 第三方脚本、浏览器扩展可随意访问
- 多组 Key 同时暴露（全局 Key + chat / image / video 独立 Key）

**修复建议**:
1. 至少改用 `sessionStorage`（页面关闭即失效）
2. 最佳实践：搭建轻量后端代理层，Key 存储在服务端或 HttpOnly cookie
3. 对输入的 API Key 做格式校验

---

### 🟠 [S-2] 动态代理导致 SSRF 风险

**位置**: `vite.config.js:8-107`（开发环境）、`src/utils/request.js:67-87`（客户端构建）、`nginx.conf:49-76`（生产环境）

**问题描述**:  
`/proxy` 端点接受客户端传来的任意 `_target` URL 参数，不做任何校验即代理转发。

```js
// request.js:67-87 — 客户端将任意 baseUrl 拼入 _target
config.url = `/proxy${urlPath}?_target=${encodeURIComponent(cleanBaseUrl)}${searchSuffix}`
```

```nginx
# nginx.conf:65 — nginx 层直接 proxy_pass 到用户可控的地址
proxy_pass $_target;
```

**风险分析**:
- 若 nginx 部署在公网，攻击者可利用此端点扫描内网服务（SSRF 攻击）
- 可代理到任意外部端点，用于绕过 IP 白名单或放大攻击流量

**修复建议**:
1. 增加目标域名白名单（正则匹配允许的 provider 域名列表）
2. nginx 层限制 `_target` 仅允许特定域名模式
3. 增加 `valid_referers` 限制

---

### 🟠 [S-3] contenteditable 编辑器存在 XSS 风险

**位置**: `src/components/nodes/TextNode.vue:52`、`src/components/nodes/LLMConfigNode.vue:44`

**问题描述**:  
使用 `contenteditable="true"` 的 div 作为文本编辑器，处理粘贴和输入时未做 HTML 净化。

```html
<div ref="editorRef" class="editor-content" contenteditable="true"
  @input="handleInput" @paste="handlePaste"
  @blur="updateContent">
</div>
```

**风险分析**:
- 粘贴带 `<script>` 标签或事件处理器的 HTML 可被存储
- 若将来用 `v-html` 渲染此内容，直接导致存储型 XSS

**修复建议**:
1. `handlePaste` 中剥离所有 HTML 标签，提取纯文本
2. 存储时统一使用纯文本格式，不要存 HTML
3. 如确实需要富文本，集成 DOMPurify 过滤

---

### 🟡 [S-4] 自定义指令使用 setTimeout(0) 注册全局事件

**位置**: `src/components/WorkflowPanel.vue:122-136`

```js
setTimeout(() => {
  document.addEventListener('click', el._clickOutside)
}, 0)
```

多个 `v-click-outside` 指令共存时，全局 click 监听器可能互相干扰。

---

## 4. 性能审计

### 🔴 [P-1] localStorage 配额溢出导致数据静默丢失

**位置**: `src/stores/projects.js:91-130`

**问题描述**:  
当 `localStorage.setItem` 抛出 `QuotaExceededError` 时，代码执行"激进清理"策略：

1. 删除所有项目缩略图
2. 清空 10 个以上旧项目的画布数据
3. 最后手段：只保留最近 5 个项目

**风险**: 用户在无任何警告的情况下丢失项目数据。

**修复建议**:
1. 清理前应弹出确认对话框并告知用户
2. 优先迁移到 IndexedDB 存储项目数据（一般 50MB+ 配额，远超 localStorage 的 5-10MB）
3. 在存储使用达到 70%/85%/95% 时分级预警

---

### 🟡 [P-2] 全量深拷贝导致内存开销

**位置**: `src/stores/canvas.js:54,81,119,531`

```js
const state = {
  nodes: JSON.parse(JSON.stringify(nodes.value)),
  edges: JSON.parse(JSON.stringify(edges.value))
}
```

每次保存历史状态都是全量克隆，最多保存 50 个历史状态。大型画布（数百节点）时单次可达数 MB。

**建议**: 实现结构化差异存储（snapshot diff）或仅保存操作记录。

---

### 🟡 [P-3] Deep watch 在大型画布上可能造成 UI 卡顿

**位置**: `src/stores/canvas.js:557-559`

```js
watch([nodes, edges], () => { debouncedSave() }, { deep: true })
```

每对 node/edge 中任意嵌套属性的变化都会触发深度遍历，高频操作时可能堆积任务。

---

### 🟡 [P-4] 轮询无退避策略

**位置**: `src/api/image.js:54-73`、`src/api/video.js:61-77`

| 类型 | 间隔 | 最大次数 | 总超时 |
|------|------|----------|--------|
| 图片 | 3 秒 | 60 次 | 3 分钟 |
| 视频 | 5 秒 | 120 次 | 10 分钟 |

没有指数退避策略。某次请求因网络错误失败后立即再次请求，可能加剧服务端负载。

---

## 5. 代码质量与架构审计

### 🔴 [A-1] 模型管理逻辑大面积重复（技术债核心）

**位置**:
- `src/hooks/useModelConfig.js`（~430 行）
- `src/stores/pinia/models.js`（~840 行）

**两份代码均实现了以下完全相同的功能**:

| 功能 | useModelConfig.js | pinia/models.js |
|------|:-:|:-:|
| 全局自定义模型 CRUD | ✅ | ✅ |
| 按 Provider 自定义模型 CRUD | ✅ | ✅ |
| 内置 + 自定义模型合并 computed | ✅ | ✅ |
| 按渠道过滤可用模型 computed | ✅ | ✅ |
| localStorage 持久化 watch | ✅ | ✅ |
| 模型选项格式化 computed | ✅ | ✅ |

**影响**: 维护噩梦——修改一处必须同步另一处。两处已有微差异（如 `useModelConfig.js` 中部分键用 `||` 兜底），这些就是未来的 bug 来源。

**建议**: **删除 `useModelConfig.js`**，全部统一到 Pinia store。

---

### 🟠 [A-2] 渠道适配逻辑重复 — 三层适配链

**位置**: `src/hooks/useProvider.js` vs `src/stores/pinia/models.js:142-157`

两处都实现了 `adaptRequest` 和 `adaptResponse`。同时 `useApi.js` 中还有第三种调用路径，直接从 `providerConfig` 调用适配器：

```js
// useApi.js:96-98 — 第三种路径
const chatAdapter = chatCfg.providerConfig?.requestAdapter?.chat
```

三层调用链增加了不一致风险和调试难度。

---

### 🟠 [A-3] 状态管理模式不统一

项目中存在三种状态管理模式混用：

| 模式 | 位置 | 说明 |
|------|------|------|
| **Pinia Store** | `stores/pinia/models.js` | 推荐的单例 store |
| **模块级 reactive ref** | `stores/canvas.js`, `stores/theme.js`, `stores/projects.js` | 轻量但不统一，不利于 SSR |
| **Hook 封装** | `hooks/useApiConfig.js`, `hooks/useModelConfig.js`, `hooks/useProvider.js` | 与 Pinia 功能重叠 |

---

### 🟡 [A-4] localStorage 键名散乱定义

`STORAGE_KEYS` 在三个地方定义，内容不完全一致：

1. `src/utils/constants.js:50-58` — 7 个键，缺少 SERVICE 系列新键
2. `src/stores/pinia/models.js:19-36` — 完整定义 10+ 个键
3. `src/hooks/useModelConfig.js` — 未引用常量，部分键用 `||` 手写兜底字符串

---

### 🟡 [A-5] Provider 特定逻辑散落在 10+ 文件中

`provider === 'aliyun'` 的判断出现在以下 10+ 文件的 20+ 处：

| 文件 | 行号 | 用途 |
|------|------|------|
| `src/utils/request.js` | 62 | 阿里云强制 baseURL='/' |
| `src/api/image.js` | 85, 93 | 阿里云模型检测和异步端点 |
| `src/api/video.js` | 24 | 阿里云添加异步头 |
| `src/stores/pinia/models.js` | 502-536 | 端点路径判断 |
| `src/hooks/useApi.js` | 199, 297 | 模型检测和适配 |
| `src/components/ApiSettings.vue` | 152-197 | UI 显示控制 |
| `src/components/ServiceConfigForm.vue` | 160-214 | UI 显示控制 |

**影响**: 添加新 Provider（如 Google Gemini、Anthropic）需要修改所有出现处，极易遗漏。

**建议**: 抽取为 Provider 适配栈——每个 Provider 一个独立适配文件，核心代码通过接口调用。

---

### 🟡 [A-6] 大量注释代码 / 死代码

- `src/views/Canvas.vue:625-635,659-662` — 注释掉的节点选中逻辑
- `src/views/Canvas.vue` 模板 — 注释掉的网格切换按钮
- `src/config/workflows.js:928-1042` — 整个 115 行的 `drama-storyboard-shot` 工作流被注释
- `src/components/nodes/TextNode.vue` — 注释掉的展开按钮
- `src/components/nodes/LLMConfigNode.vue:49-58` — 注释掉的提及预览

---

### 🔵 [A-7] defineAsyncComponent 使用时机不当

**位置**: `src/components/ApiSettings.vue:126`

```js
const ServiceConfigForm = defineAsyncComponent(() => import('./ServiceConfigForm.vue'))
```

`ApiSettings` 通过 props 传递表单数据给 `ServiceConfigForm`，异步加载延迟可能导致组件挂载前父组件已发送初始数据。

---

## 6. Bug 风险分析

### 🟠 [B-1] IndexedDB 图片缓存无大小限制

**位置**: `src/utils/imageCache.js`

图片以 base64 字符串存入 IndexedDB。base64 编码比原始二进制大 ~33%（100 张 4K 图片可占用 2GB+）。

`localStorage` 中的项目数据在保存时删除了 base64 字段（`projects.js:57`），但 IndexedDB 中的缓存仍然保留，`cleanExpiredCache` 仅按 30 天过期清理，没有主动大小管理。

---

### 🟠 [B-2] 边 ID 可能冲突

**位置**: `src/stores/canvas.js:329`

```js
const newEdge = { id: `edge_${params.source}_${params.target}`, ...params }
```

若相同 source-target 之间存在两条不同 handle 类型的边，第二条会覆盖第一条。

---

### 🟡 [B-3] 视频轮询判断逻辑不一致

**位置**: `src/api/video.js:65-68` vs `src/hooks/useApi.js:410`

| 位置 | 完成判断条件 |
|------|-------------|
| `api/video.js:65` | `result.status === 'completed' \|\| result.data` |
| `hooks/useApi.js:410` | `result.status === 'completed' \|\| result.status === 'succeeded' \|\| result.data` |

阿里云万相模型走 `useApi.js` 的轮询，其他模型走 `pollVideoTask`，两处条件不同导致行为不一致。

---

### 🟡 [B-4] 全局 API Bridge 非空引用风险

**位置**: `src/utils/request.js:132` 及多处

```js
window.$message?.error(message || 'Request failed')
```

`window.$message` 在 `App.vue:52` 注入。若请求在 App 挂载完成前发生，`?.` 导致错误静默吞掉。

---

### 🔵 [B-5] 节点 ID 计数器问题

**位置**: `src/stores/canvas.js:436-443`

```js
// 项目加载时从最大现有 ID 恢复
const maxId = nodes.value.reduce(...match(/node_(\d+)/)...)
nodeId = maxId + 1
```

项目切换时计数器从当前项目最大 ID 继续，但同一 tab 内创建多个项目时可能出现短暂的 ID 冲突窗口。

---

## 7. 依赖审计

| 依赖 | 版本 | 安全状态 | 备注 |
|------|------|----------|------|
| `vue` | ^3.5.24 | ✅ 最新 | 稳定 |
| `pinia` | ^3.0.4 | ✅ 最新 | 稳定 |
| `vue-router` | ^4.2.5 | ⚠️ 建议升级 | 当前最新 4.4+ |
| `axios` | ^1.13.2 | ✅ 最新 | 安全 |
| `naive-ui` | ^2.43.2 | ✅ 最新 | 稳定 |
| `vite` | ^5.4.21 | ✅ 最新 | 稳定 |
| `@vue-flow/core` | ^1.48.1 | ✅ 最新 | 稳定 |
| `tailwindcss` | ^3.4.19 | ⚠️ 建议升级 | v4 已发布 |
| `@vicons/ionicons5` | ^0.13.0 | ✅ 纯图标 | 无运行时风险 |

**总体评价**: 依赖管理良好，无高危漏洞包，均为当前主流稳定版本。

---

## 8. 改进建议汇总

### 必须立即处理（High Priority）

| 编号 | 问题 | 分类 | 涉及文件 |
|------|------|------|----------|
| [S-1](#%F0%9F%94%B4-s-1-api-key-%E6%98%8E%E6%96%87%E5%AD%98%E5%82%A8%E4%BA%8E-localstorage) | API Key 明文存储 localStorage | 安全 | 所有 localStorage 读写位 |
| [A-1](#%F0%9F%94%B4-a-1-%E6%A8%A1%E5%9E%8B%E7%AE%A1%E7%90%86%E9%80%BB%E8%BE%91%E5%A4%A7%E9%9D%A2%E7%A7%AF%E9%87%8D%E5%A4%8D) | 模型管理逻辑重复（两套实现） | 架构 | `hooks/useModelConfig.js` + `stores/pinia/models.js` |
| [S-2](#%F0%9F%9F%A0-s-2-%E5%8A%A8%E6%80%81%E4%BB%A3%E7%90%86%E5%AF%BC%E8%87%B4-ssrf-%E9%A3%8E%E9%99%A9) | 动态代理 SSRF 风险 | 安全 | `nginx.conf` / `request.js` |
| [P-1](#%F0%9F%94%B4-p-1-localstorage-%E9%85%8D%E9%A2%9D%E6%BA%A2%E5%87%BA%E5%AF%BC%E8%87%B4%E6%95%B0%E6%8D%AE%E9%9D%99%E9%BB%98%E4%B8%A2%E5%A4%B1) | localStorage 溢出数据丢失 | 可靠性 | `stores/projects.js` |

### 建议尽快处理（Medium Priority）

| 编号 | 问题 | 分类 | 涉及文件 |
|------|------|------|----------|
| [A-2](#%F0%9F%9F%A0-a-2-%E6%B8%A0%E9%81%93%E9%80%82%E9%85%8D%E9%80%BB%E8%BE%91%E9%87%8D%E5%A4%8D) | 渠道适配逻辑重复 | 架构 | `useProvider.js` 等 |
| [A-3](#%F0%9F%9F%A0-a-3-%E7%8A%B6%E6%80%81%E7%AE%A1%E7%90%86%E6%A8%A1%E5%BC%8F%E4%B8%8D%E7%BB%9F%E4%B8%80) | 状态管理不统一 | 架构 | 多处 |
| [A-5](#%F0%9F%9F%A1-a-5-provider-%E7%89%B9%E5%AE%9A%E9%80%BB%E8%BE%91%E6%95%A3%E8%90%BD%E5%9C%A8-10-%E6%96%87%E4%BB%B6%E4%B8%AD) | Provider 逻辑散落 10+ 文件 | 架构 | 10+ 文件 |
| [B-1](#%F0%9F%9F%A0-b-1-indexeddb-%E5%9B%BE%E7%89%87%E7%BC%93%E5%AD%98%E6%97%A0%E5%A4%A7%E5%B0%8F%E9%99%90%E5%88%B6) | IndexedDB 缓存无限制 | Bug 风险 | `utils/imageCache.js` |
| [S-3](#%F0%9F%9F%A0-s-3-contenteditable-%E5%AD%98%E5%9C%A8-xss-%E9%A3%8E%E9%99%A9) | contenteditable XSS 风险 | 安全 | `TextNode.vue`, `LLMConfigNode.vue` |
| [B-2](#%F0%9F%9F%A0-b-2-%E8%BE%B9-id-%E5%8F%AF%E8%83%BD%E5%86%B2%E7%AA%81) | 边 ID 冲突 | Bug 风险 | `canvas.js` |
| [A-4](#%F0%9F%9F%A1-a-4-localstorage-%E9%94%AE%E5%90%8D%E6%95%A3%E4%B9%B1%E5%AE%9A%E4%B9%89) | localStorage 键名散乱 | 代码质量 | 多处 |

### 可留待后续优化（Low Priority）

| 编号 | 问题 | 分类 |
|------|------|------|
| [P-2](#%F0%9F%9F%A1-p-2-%E5%85%A8%E9%87%8F%E6%B7%B1%E6%8B%B7%E8%B4%9D%E5%AF%BC%E8%87%B4%E5%86%85%E5%AD%98%E5%BC%80%E9%94%80) | 全量深拷贝内存开销 | 性能 |
| [P-3](#%F0%9F%9F%A1-p-3-deep-watch-%E5%9C%A8%E5%A4%A7%E5%9E%8B%E7%94%BB%E5%B8%83%E4%B8%8A%E5%8F%AF%E8%83%BD%E9%80%A0%E6%88%90-ui-%E5%8D%A1%E9%A1%BF) | Deep watch 影响 UI 性能 | 性能 |
| [P-4](#%F0%9F%9F%A1-p-4-%E8%BD%AE%E8%AF%A2%E6%97%A0%E9%80%80%E9%81%BF%E7%AD%96%E7%95%A5) | 轮询无退避策略 | 性能 |
| [A-6](#%F0%9F%9F%A1-a-6-%E5%A4%A7%E9%87%8F%E6%B3%A8%E9%87%8A%E4%BB%A3%E7%A0%81--%E6%AD%BB%E4%BB%A3%E7%A0%81) | 注释/死代码 | 代码质量 |
| [A-7](#%F0%9F%94%B5-a-7-defineasynccomponent-%E4%BD%BF%E7%94%A8%E6%97%B6%E6%9C%BA%E4%B8%8D%E5%BD%93) | 异步组件不良实践 | 代码质量 |
| [B-3](#%F0%9F%9F%A1-b-3-%E8%A7%86%E9%A2%91%E8%BD%AE%E8%AF%A2%E5%88%A4%E6%96%AD%E9%80%BB%E8%BE%91%E4%B8%8D%E4%B8%80%E8%87%B4) | 视频轮询判断不一致 | Bug 风险 |
| [B-4](#%F0%9F%9F%A1-b-4-%E5%85%A8%E5%B1%80-api-bridge-%E9%9D%9E%E7%A9%BA%E5%BC%95%E7%94%A8%E9%A3%8E%E9%99%A9) | 全局 API Bridge 引用风险 | Bug 风险 |
| [B-5](#%F0%9F%94%B5-b-5-%E8%8A%82%E7%82%B9-id-%E8%AE%A1%E6%95%B0%E5%99%A8%E9%97%AE%E9%A2%98) | 节点 ID 计数器问题 | Bug 风险 |

---

## 修复优先级建议

如果只有有限的修复时间，建议按以下顺序推进：

```
第一优先级（安全红线 + 架构债）
├── 🔴 [S-1] API Key 加密存储或改用后端代理层
├── 🔴 [A-1] 删除 useModelConfig.js，统一到 Pinia store
├── 🟠 [S-2] nginx 代理增加域名白名单
└── 🔴 [P-1] 项目数据迁移到 IndexedDB 存储

第二优先级（代码质量 + 潜在 Bug）
├── 🟠 [A-2] 整合适配器逻辑，消除三层调用链
├── 🟠 [A-3] 统一状态管理模式
├── 🟠 [A-5] 抽取 Provider 适配栈，按文件隔离
├── 🟠 [S-3] contenteditable paste 做 HTML 净化
└── 🟠 [B-2] 边 ID 加入 handle 标识

第三优先级（优化迭代）
├── 🟡 [P-2] 历史记录差分存储
├── 🟡 [A-4] 统一 STORAGE_KEYS 定义
├── 🟡 [A-6] 清理注释代码
└── 🔵 其余低优先级问题
```
