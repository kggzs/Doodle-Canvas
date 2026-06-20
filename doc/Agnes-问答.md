# Agnes 问答模型接入笔记

> Provider：`agnes`
> 模型类型：`chat`
> 推荐模型：`agnes-2.0-flash`

## 后台配置

在 `/admin/models/chat` 中配置：

| 字段 | 建议值 |
| --- | --- |
| Provider | `agnes` |
| API 地址 | `https://apihub.agnes-ai.com` |
| API 路径 | `/v1/chat/completions` |
| 调用模型名称 | `agnes-2.0-flash` |
| 用户显示名称 | `Agnes 2.0 Flash` |
| API Key | 后台填写，服务端加密保存 |

## 能力

- Chat Completions。
- 多轮对话。
- 流式输出。
- 工具调用参数透传。
- 图片 URL 输入理解。
- OpenAI Chat Completions 兼容请求结构。

## 请求结构

后端会按 OpenAI Chat Completions 结构发送：

```json
{
  "model": "agnes-2.0-flash",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Explain how agents use tools." }
  ],
  "temperature": 0.7,
  "stream": false
}
```

图片理解可使用内容数组：

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "Describe this image." },
    { "type": "image_url", "image_url": { "url": "https://example.com/image.jpg" } }
  ]
}
```

## Thinking 参数

如果需要开启 Thinking，可在模型默认参数中配置：

```json
{
  "chat_template_kwargs": {
    "enable_thinking": true
  }
}
```

或按兼容请求透传：

```json
{
  "thinking": {
    "type": "enabled",
    "budget_tokens": 2048
  }
}
```

## 响应解析

Agnes 问答按 OpenAI 兼容格式返回：

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 35,
    "completion_tokens": 58,
    "total_tokens": 93
  }
}
```

流式响应由后端 SSE 透传，并在结束后更新生成记录。

## 注意事项

- 图片 URL 必须公网可访问。
- API Key 不要写入前端或文档。
- 上游 401/403 会在用户侧显示友好错误，在 `/admin/error-logs` 保留原始上游信息。
- 如 API 地址已经包含 `/v1`，API 路径可写 `/chat/completions`，后端会规避重复版本段。
