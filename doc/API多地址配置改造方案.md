# API 多地址配置改造方案

> 目标：将当前的「单一全局渠道」改造为「按服务（问答 / 图片 / 视频）独立配置 API 地址」的架构，同时兼容「一个地址通用」的简易场景。

---

## 一、背景与问题

### 1.1 用户诉求

> 项目配置 API 设置改为可以设置三个 API 地址，分别对应问答模型、图片模型、视频模型；或者设置一个 API 地址，用于配置更换不同的模型。因为有的地址不支持图片模型和问答模型，所以要区分设置；有的 API 可以支持图片和问答，就可以设置一个模型。

核心诉求：
- **区分设置**：问答、图片、视频可分别配置不同的 API 地址（provider + baseUrl + apiKey）。
- **统一设置**：若一个 API 地址同时支持多种能力，可只设一套。
- **灵活切换模型**：不同 API 地址能挂不同的模型。

### 1.2 现状分析

当前为「单一全局渠道」架构，三类模型共用一套 provider / apiKey / baseUrl：

| 存储键 | 结构 | 说明 |
|---|---|---|
| `api-provider` | `'openai' \| 'aliyun'` | 当前全局渠道（字符串） |
| `api-keys-by-provider` | `{ openai, aliyun }` | 按渠道存 apiKey |
| `base-urls-by-provider` | `{ openai, aliyun }` | 按渠道存 baseUrl |

关键代码路径：

1. **请求拦截器** `src/utils/request.js:18-92`
   - 只读取 `localStorage['api-provider']` 决定本次请求用哪个 apiKey / baseUrl。
   - **无法区分**当前请求是问答 / 图片 / 视频，因为拦截器只能看到 url。
2. **流式问答** `src/api/chat.js:16-86` `streamChatCompletions`
   - 用原生 `fetch`，**不走** axios 拦截器，自行读 `api-provider` + `api-keys-by-provider`。
3. **模型选择自动切渠道** `ImageConfigNode.vue` / `VideoConfigNode.vue` / `LLMConfigNode.vue` 的 `handleModelSelect`
   - 选模型时把**全局** `modelStore.setProvider(model.provider[0])` 切走 → 会导致一个节点改模型，全局三套配置全被影响。
4. **配置 UI** `src/components/ApiSettings.vue`
   - 只有一组「渠道 / Base URL / API Key」表单，全局生效。

### 1.3 痛点小结

- 问答用 OpenAI、图片用阿里云万相、视频用另一家 → **当前无法做到**，三套强制走同一个 provider。
- 切换某个节点的模型会偷偷改全局渠道，影响其它节点。
- 拦截器层缺少「服务类型」上下文。

---

## 二、目标设计

### 2.1 总体思路：「全局默认 + 按服务独立覆盖」

引入 **按服务（service）维度** 的配置，service ∈ `chat | image | video`：

- 每个服务可独立配置 `provider / apiKey / baseUrl`（区分设置场景）。
- 服务配置为空时，**回退到全局默认**（一个地址通用的场景）。
- 全局默认沿用现有「单渠道」语义，保证旧用户零感知升级。

> 这套方案同时满足「三个地址」与「一个地址」两种诉求，且向后兼容。

### 2.2 新数据结构（localStorage）

新增三个键，按服务维度存储：

```jsonc
// service-providers：每个服务用哪个 provider
{ "chat": "openai", "image": "aliyun", "video": "aliyun" }

// service-api-keys：每个服务独立的 apiKey（为空则回退全局）
{ "chat": "sk-xxx", "image": "sk-yyy", "video": "sk-zzz" }

// service-base-urls：每个服务独立的 baseUrl（为空则回退全局）
{ "chat": "https://...", "image": "https://...", "video": "https://..." }
```

保留旧键作为「全局默认」来源（兼容），语义变为「全局默认渠道」。

### 2.3 配置解析规则（统一封装）

新增统一函数 `getServiceConfig(service)`，所有请求层只依赖它：

```
serviceConfig[service].provider  → 若空 → currentProvider（全局默认）
serviceConfig[service].apiKey    → 若空 → apiKeysByProvider[全局provider]
serviceConfig[service].baseUrl   → 若空 → baseUrlsByProvider[全局provider] || 默认
```

> 「阿里云 provider 走 /services、/tasks 代理」的特殊逻辑保留在原有位置，按解析出的 provider 判定。

### 2.4 服务类型如何在请求层传递

由于 axios 拦截器只看得到 url，需显式带上「服务类型」上下文。采用 **自定义请求头 `X-Service-Type`**：

- API 调用层在请求时设置 `headers['X-Service-Type'] = 'chat' | 'image' | 'video'`。
- 拦截器读取该头决定用哪套配置；头缺失时回退全局（兼容旧调用）。
- 该头仅为本地路由用，不影响上游（上游会忽略未知头）。

---

## 三、文件改动清单

| # | 文件 | 改动类型 | 说明 |
|---|---|---|---|
| 1 | `src/stores/pinia/models.js` | 改造 | 新增按服务配置 state / computed / setter / getter / 持久化 / 迁移 |
| 2 | `src/utils/request.js` | 改造 | 拦截器按 `X-Service-Type` 解析 apiKey/baseUrl |
| 3 | `src/api/chat.js` | 改造 | `streamChatCompletions` 读服务化配置；普通 `chatCompletions` 带服务头 |
| 4 | `src/api/image.js` | 改造 | `generateImage` 请求带 `X-Service-Type: image` |
| 5 | `src/api/video.js` | 改造 | `createVideoTask` / `getVideoTaskStatus` 带 `X-Service-Type: video` |
| 6 | `src/hooks/useApi.js` | 改造 | 三个 hook 传 serviceType；问答流式传服务化 apiKey/baseUrl |
| 7 | `src/hooks/useWorkflowOrchestrator.js` | 小改 | `analyzeIntent` 调 chat 时确保用 chat 服务配置 |
| 8 | `src/components/nodes/LLMConfigNode.vue` | 改造 | 选模型时切 chat 服务 provider（而非全局） |
| 9 | `src/components/nodes/ImageConfigNode.vue` | 改造 | 选模型时切 image 服务 provider |
| 10 | `src/components/nodes/VideoConfigNode.vue` | 改造 | 选模型时切 video 服务 provider |
| 11 | `src/components/ApiSettings.vue` | 重构 | 「API 配置」Tab 改为按服务（问答/图片/视频）分组的表单 |
| 12 | `src/views/Canvas.vue` | 小改 | 润色/问答 isConfigured 判定改用 chat 服务配置 |

---

## 四、详细实现方案

### 4.1 `src/stores/pinia/models.js`（核心改造点）

#### 4.1.1 新增存储键

```js
const STORAGE_KEYS = {
  // ... 保留原有
  SERVICE_PROVIDERS: 'service-providers',     // { chat, image, video }
  SERVICE_API_KEYS: 'service-api-keys',       // { chat, image, video }
  SERVICE_BASE_URLS: 'service-base-urls',     // { chat, image, video }
}
```

#### 4.1.2 新增 state

```js
const SERVICE_TYPES = ['chat', 'image', 'video']

// 按服务的 provider（为空字符串表示「用全局默认」）
const serviceProviders = ref(getStoredJson(STORAGE_KEYS.SERVICE_PROVIDERS, { chat:'', image:'', video:'' }))
const serviceApiKeys   = ref(getStoredJson(STORAGE_KEYS.SERVICE_API_KEYS, { chat:'', image:'', video:'' }))
const serviceBaseUrls  = ref(getStoredJson(STORAGE_KEYS.SERVICE_BASE_URLS, { chat:'', image:'', video:'' }))
```

#### 4.1.3 统一解析 getter（关键）

```js
// 解析某服务的最终配置：独立配置优先，空则回退全局默认
const getServiceConfig = (service) => {
  const provider = serviceProviders.value[service] || currentProvider.value
  const apiKey   = serviceApiKeys.value[service]   || apiKeysByProvider.value[provider] || ''
  const baseUrl  = serviceBaseUrls.value[service]  || baseUrlsByProvider.value[provider] || getDefaultBaseUrl(provider)
  return { provider, apiKey, baseUrl }
}

// 兼容：各端点方法改为按 service 取 providerConfig
// getImageEndpoint()  → 用 getServiceConfig('image').provider 取 endpoints
// getVideoEndpoint()  → 用 getServiceConfig('video').provider
// getChatEndpoint()   → 用 getServiceConfig('chat').provider
```

#### 4.1.4 setter

```js
const setServiceProvider = (service, provider) => { serviceProviders.value[service] = provider }
const setServiceApiKey   = (service, key)       => { serviceApiKeys.value[service] = key }
const setServiceBaseUrl  = (service, url)       => { serviceBaseUrls.value[service] = url }
```

#### 4.1.5 isConfigured 语义升级

```js
// 某服务是否已配置（用于按钮禁用判断）
const isServiceConfigured = (service) => !!getServiceConfig(service).apiKey

// 兼容旧的 currentApiKey（保持 = chat 服务的 key，避免大量调用点报错）
// 也可改为「任一服务已配置」，二选一，建议保持 chat
```

#### 4.1.6 持久化 watch

```js
watch(serviceProviders, v => setStoredJson(STORAGE_KEYS.SERVICE_PROVIDERS, v), { deep:true })
watch(serviceApiKeys,   v => setStoredJson(STORAGE_KEYS.SERVICE_API_KEYS,   v), { deep:true })
watch(serviceBaseUrls,  v => setStoredJson(STORAGE_KEYS.SERVICE_BASE_URLS,  v), { deep:true })
```

#### 4.1.7 迁移逻辑（一次性，向后兼容）

应用启动 / store 初始化时执行：

```js
// 若新键全空且存在旧全局渠道，则把旧全局渠道复制到三个服务（保留旧行为）
const migrateToServiceConfig = () => {
  const hasNew = serviceProviders.value.chat || serviceProviders.value.image || serviceProviders.value.video
  if (hasNew) return
  const g = currentProvider.value
  if (!g) return
  serviceProviders.value = { chat: g, image: g, video: g }
  // apiKey/baseUrl 通过「空则回退全局」自动生效，无需复制
}
migrateToServiceConfig()
```

#### 4.1.8 `clearConfigCache` 同步清理新键

在 `keysToClear` 数组与响应式重置里补充三个新键。

#### 4.1.9 导出

```js
return {
  // ... 原有
  SERVICE_TYPES,
  serviceProviders, serviceApiKeys, serviceBaseUrls,
  getServiceConfig, isServiceConfigured,
  setServiceProvider, setServiceApiKey, setServiceBaseUrl,
}
```

---

### 4.2 `src/utils/request.js`（拦截器改造）

拦截器读取 `X-Service-Type` 头，按服务解析配置：

```js
instance.interceptors.request.use((config) => {
  const serviceType = config.headers?.['X-Service-Type'] || ''   // 'chat'|'image'|'video'|''

  // 1. 解析 provider
  let provider = currentProvider.value  // 全局默认
  if (serviceType) {
    const sp = JSON.parse(localStorage.getItem('service-providers') || '{}')
    provider = sp[serviceType] || provider
  }

  // 2. 解析 apiKey
  let apiKey = ''
  if (serviceType) {
    const sak = JSON.parse(localStorage.getItem('service-api-keys') || '{}')
    apiKey = sak[serviceType] || ''
  }
  if (!apiKey) {
    const ak = JSON.parse(localStorage.getItem('api-keys-by-provider') || '{}')
    apiKey = ak[provider] || ''
  }

  // 3. 解析 baseUrl（service 优先，否则全局，否则默认）
  let baseUrl = ''
  if (serviceType) {
    const sbu = JSON.parse(localStorage.getItem('service-base-urls') || '{}')
    baseUrl = sbu[serviceType] || ''
  }
  if (!baseUrl) {
    const bu = JSON.parse(localStorage.getItem('base-urls-by-provider') || '{}')
    baseUrl = bu[provider] || ''
  }

  // 4. 阿里云走 /services /tasks 代理（保持原逻辑，改判 provider）
  if (provider === 'aliyun') {
    config.baseURL = '/'
  } else if (baseUrl) {
    // 走 /proxy 动态代理（同原逻辑）
    ...
  }

  if (apiKey) config.headers['Authorization'] = `Bearer ${apiKey}`
  return config
})
```

> 注：拦截器直接读 localStorage 是现有风格，与 store 逻辑保持一致即可；也可后续重构为通过 store getter 读取（更优雅，第二阶段做）。

---

### 4.3 `src/api/chat.js`

#### `streamChatCompletions`（原生 fetch，需改）

把 apiKey/baseUrl 的来源改为「chat 服务配置」：

```js
export const streamChatCompletions = async function* (data, signal, options = {}) {
  // 读 chat 服务的 provider → 解析 apiKey / baseUrl
  const sp  = JSON.parse(localStorage.getItem('service-providers')   || '{}')
  const sak = JSON.parse(localStorage.getItem('service-api-keys')    || '{}')
  const sbu = JSON.parse(localStorage.getItem('service-base-urls')   || '{}')
  const gProvider = localStorage.getItem('api-provider') || 'openai'

  const provider = sp.chat || gProvider
  let apiKey = options.apiKey || sak.chat || ''
  if (!apiKey) {
    const ak = JSON.parse(localStorage.getItem('api-keys-by-provider') || '{}')
    apiKey = ak[provider] || ''
  }
  const baseUrl = options.baseUrl
    || sbu.chat
    || (JSON.parse(localStorage.getItem('base-urls-by-provider') || '{}'))[provider]
    || getBaseUrl()
  const endpoint = options.endpoint || '/chat/completions'
  // 阿里云 chat 走代理 → baseUrl 用 window.location.origin，endpoint 用 provider endpoints
  ...
}
```

#### `chatCompletions`（走 axios）

```js
export const chatCompletions = (data) =>
  request({ url: '/chat/completions', method: 'post', data, headers: { 'X-Service-Type': 'chat' } })
```

---

### 4.4 `src/api/image.js`

`generateImage` 内所有 `request()` 调用补头：

```js
headers: { 'X-Service-Type': 'image', ...原headers }
```

阿里云分支同样补头（虽然阿里云走 `/`，但头不影响）。

---

### 4.5 `src/api/video.js`

`createVideoTask` 与 `getVideoTaskStatus` 的 `request()` 补头：

```js
headers: { 'X-Service-Type': 'video', ...原headers }
```

---

### 4.6 `src/hooks/useApi.js`

#### `useChat`（流式问答）

- `getChatEndpoint()` 已返回完整 url（基于 getServiceConfig('chat')）。
- `currentApiKey` → 改为 `modelStore.getServiceConfig('chat').apiKey`。
- `streamChatCompletions` 调用参数里 baseUrl/endpoint/apiKey 都从 chat 服务取。

#### `useImageGeneration` / `useVideoGeneration`

- `provider: modelStore.currentProvider` → `provider: modelStore.getServiceConfig('image'|'video').provider`。
- endpoint 方法已在 store 内部按 service 取 providerConfig，无需改调用点。

---

### 4.7 节点：模型选择切「服务 provider」而非全局

三个节点 `handleModelSelect` 中：

```js
// 旧：modelStore.setProvider(config.provider[0])  // 改全局
// 新：
const service = this 节点类型对应的服务   // imageConfig→'image', videoConfig→'video', llmConfig→'chat'
if (config?.provider?.length > 0) {
  modelStore.setServiceProvider(service, config.provider[0])
}
```

> 这样一个图片节点切万相，不会再影响问答节点的渠道。

---

### 4.8 `src/components/ApiSettings.vue`（UI 重构）

「API 配置」Tab 改为 **按服务分组**，结构：

```
┌─ API 配置 ─────────────────────────────────┐
│  [×] 启用按服务独立配置   （开关）          │   ← 关闭时三组表单禁用，只显示全局一组
│                                              │
│  ── 全局默认（所有服务的兜底） ──           │
│   渠道：[openai ▾]  Base URL: [____]        │
│   API Key: [____________]                    │
│                                              │
│  ── 问答服务（覆盖） ──                     │
│   渠道：[▾] Base URL:[____]  API Key:[___]   │
│  ── 图片服务（覆盖） ──                     │
│   渠道：[▾] Base URL:[____]  API Key:[___]   │
│  ── 视频服务（覆盖） ──                     │
│   渠道：[▾] Base URL:[____]  API Key:[___]   │
│                                              │
│  端点路径预览（按当前生效 provider 展示）    │
└──────────────────────────────────────────────┘
```

要点：
- 顶部开关：关闭 = 只用全局默认（旧体验，一个地址通用）；开启 = 可为每个服务单独覆盖。
- 每组服务表单的渠道切换时，Base URL 自动填该 provider 的 `defaultBaseUrl`（沿用 `updateFormApiConfig` 思路）。
- 阿里云 provider 的 Base URL 仍禁用（走代理）。
- 端点预览按「该服务生效的 provider」分别展示。
- 保存逻辑：写入 `serviceProviders / serviceApiKeys / serviceBaseUrls` 与全局键。

---

### 4.9 `src/views/Canvas.vue`

润色 / 问答入口的 `isApiConfigured` 判定：

```js
// 旧：const isApiConfigured = computed(() => !!modelStore.currentApiKey)
// 新：
const isApiConfigured = computed(() => modelStore.isServiceConfigured('chat'))
```

---

## 五、实施步骤（建议分阶段提交）

### 阶段一：数据层（无 UI 变化，向后兼容）
1. `stores/pinia/models.js`：加新键、state、`getServiceConfig`、setter、持久化、迁移、清理。
2. `utils/request.js`：拦截器按 `X-Service-Type` 解析。
3. API 层（chat/image/video）补 `X-Service-Type` 头；`streamChatCompletions` 改读 chat 服务配置。
4. **验证**：不打开新 UI，旧的全局配置仍可用（迁移逻辑把全局复制到三服务），三类模型都能跑通。

### 阶段二：节点模型选择解耦
5. 三个 ConfigNode 的 `handleModelSelect` 改切服务 provider。
6. **验证**：图片选万相、问答选 GPT，互不影响。

### 阶段三：UI 重构
7. `ApiSettings.vue` 重构为按服务分组 + 开关。
8. `Canvas.vue` isConfigured 判定。
9. **验证**：开关关闭走全局；开启后每个服务独立配置生效。

### 阶段四：收尾
10. `clearConfigCache` 同步清新键。
11. 文档更新（README / RUN-GUIDE 中 API 配置说明）。

---

## 六、测试计划

| 场景 | 预期 |
|---|---|
| 全局只配 OpenAI，不开启按服务配置 | 三类模型都走 OpenAI（等价旧行为） |
| 问答=OpenAI、图片=阿里云、视频=阿里云 | 各自走对应渠道与 key |
| 切换图片节点模型为万相 | 仅 image 服务 provider 变，问答仍走 OpenAI |
| 清理缓存 | 新旧键全部清除，重置为默认 |
| 阿里云视频轮询 `/tasks/{id}` | 仍走代理，apiKey 取 video 服务 |
| 旧用户升级首次打开 | 自动迁移，无配置丢失 |
| 问答服务 baseUrl 留空 | 回退全局 baseUrl |
| 图片服务 apiKey 留空 | 回退全局 provider 的 key |

---

## 七、风险与兼容性

1. **向后兼容**：迁移逻辑保证旧 `api-provider` / `api-keys-by-provider` / `base-urls-by-provider` 用户无感知升级。
2. **拦截器耦合 localStorage**：当前拦截器直接读 localStorage，改造延续该风格；如需更优雅可在阶段二之后改为通过 store 实例读取（注意拦截器是模块级单例，需 `useModelStore(pinia实例)`）。
3. **`X-Service-Type` 头泄露**：仅本地 Vite 代理用，代理转发时会带上但上游会忽略未知头；如担心可在代理插件里剥离（可选）。
4. **流式问答**：`streamChatCompletions` 不走拦截器，已单独处理，需重点测试。
5. **多窗口/多标签**：localStorage 跨标签共享，切配置后其它标签需刷新（现状一致）。

---

## 八、验收标准

- [ ] 「一个 API 地址通用」场景：仅需配全局一组，三类模型可用。
- [ ] 「三个 API 地址区分」场景：问答、图片、视频分别配不同 provider/key/url，各自独立生效。
- [ ] 节点切换模型不再污染其它服务渠道。
- [ ] 旧配置自动迁移，无数据丢失。
- [ ] 阿里云代理路径（`/services`、`/tasks`、`/proxy`）行为不变。
- [ ] 清理缓存可完全重置。
