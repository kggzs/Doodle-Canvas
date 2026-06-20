# API 多地址配置当前方案

> 更新时间：2026-06-20
> 状态：已从早期“前端 localStorage 多地址方案”演进为“后台三类模型 + 同类型多渠道线路”。

## 当前结论

API 地址、API Key 和模型调用参数不再由前端用户配置。当前实现统一在管理后台维护：

- 问答模型：`/admin/models/chat`
- 图片模型：`/admin/models/image`
- 视频模型：`/admin/models/video`

每个模型类型都可以配置多个渠道地址，并绑定到一个或多个同类型模型。前端画布只读取 `/api/models` 返回的公开模型。

## 数据模型

| 表 | 作用 |
| --- | --- |
| `models` | 模型定义：调用模型名、显示名、类型、默认参数、启用状态 |
| `model_channels` | 渠道地址：Provider、模型类型、Base URL、API Key、端点配置、超时 |
| `model_channel_bindings` | 模型与渠道绑定：权重、轮换策略、启用状态 |
| `billing_rules` | 模型计费规则 |

关键约束：

- `models.model_type` 与 `model_channels.model_type` 必须一致才能绑定。
- API Key 加密存储，接口不返回明文。
- 用户侧只看启用且有可用渠道绑定的模型。

## 配置方式

1. 登录 `/admin`。
2. 进入对应类型页面。
3. 创建渠道：
   - Provider：`openai`、`aliyun`、`doubao`、`stepfun`、`agnes`、`custom`
   - Base URL
   - API 路径，或在配置 JSON 中写 endpoints
   - API Key
4. 创建模型：
   - 调用模型名，例如 `gpt-4o-mini`、`wan2.7-image-pro`
   - 用户显示名
   - 默认参数，例如 `size`、`resolution`、`duration`
5. 绑定渠道：
   - 一个模型可绑定多条同类型渠道。
   - 支持 `round_robin`、`weighted_random`、`priority`、`failover`。
6. 配置计费规则。

## 运行时调用

前端调用：

- 图片：`POST /api/generate/image`
- 视频：`POST /api/generate/video`
- 视频查询：`GET /api/generate/video/:taskId`
- 问答：`POST /api/chat/completions`
- 流式问答：`POST /api/chat/completions/stream`

后端流程：

1. 根据请求中的 `model` 查找启用模型。
2. 查找同类型启用绑定和启用渠道。
3. 按轮换策略选择渠道。
4. 解密 API Key。
5. 按 Provider 适配请求体和响应。
6. 写生成记录、扣费、转存文件、更新结果。

## 默认端点

| Provider | Chat | Image | Video |
| --- | --- | --- | --- |
| `openai` | `/v1/chat/completions` | `/v1/images/generations` | `/v1/videos` |
| `aliyun` | `/v1/chat/completions` | `/services/aigc/multimodal-generation/generation` | `/services/aigc/video-generation/video-synthesis` |
| `doubao` | `/api/v3/responses` | `/api/v3/images/generations` | 暂无 |
| `stepfun` | `/v1/chat/completions` | `/v1/images/generations` / `/v1/images/edits` | 暂无 |
| `agnes` | `/v1/chat/completions` | `/v1/images/generations` | `/v1/videos` |
| `custom` | `/v1/chat/completions` | `/v1/images/generations` | `/v1/videos` |

渠道配置中的 `config.endpoints` 可以覆盖默认端点。

## 与旧方案差异

旧方案计划：

- 前端 localStorage 保存 `service-providers`、`service-api-keys`、`service-base-urls`。
- 请求头 `X-Service-Type` 区分 chat/image/video。
- 前端拦截器拼接上游地址。

当前方案：

- 前端不保存 API Key。
- 不需要 `X-Service-Type`。
- 后端通过模型类型确定服务类型。
- 所有第三方请求由后端发起。
- 支持多用户、计费、错误日志、文件转存和后台审计方向。

## 验收标准

- 后台同一类型下可创建多个渠道线路。
- 创建模型时可直接绑定默认渠道。
- 用户侧模型下拉仅出现公开可用模型。
- 删除已有生成历史的模型或渠道不会破坏历史记录。
- 上游认证失败、超时、网络错误能在 `/admin/error-logs` 查询。
- 生成成功后文件进入 `/admin/files`，记录进入 `/admin/records`。
