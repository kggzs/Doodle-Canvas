# Agnes 图片生成接入笔记

> Provider：`agnes`
> 模型类型：`image`
> 推荐模型：`agnes-image-2.1-flash`

## 后台配置

在 `/admin/models/image` 中配置：

| 字段 | 建议值 |
| --- | --- |
| Provider | `agnes` |
| API 地址 | `https://apihub.agnes-ai.com` |
| API 路径 | `/v1/images/generations` |
| 调用模型名称 | `agnes-image-2.1-flash` |
| 用户显示名称 | `Agnes Image 2.1 Flash` |
| 默认尺寸 | `1024x768` 或 `1024x1024` |

可在模型默认参数中配置：

```json
{
  "size": "1024x768",
  "response_format": "url"
}
```

## 能力

- 文生图。
- 图生图。
- 多张参考图。
- URL 输出。
- Base64 输出。
- 输入图片支持公网 URL 或 Data URI。

## 后端适配规则

`providerType === "agnes"` 时，后端会构造：

```json
{
  "model": "agnes-image-2.1-flash",
  "prompt": "A cinematic product photo...",
  "size": "1024x768",
  "n": 1,
  "return_base64": false,
  "extra_body": {
    "response_format": "url"
  }
}
```

如果请求带 `image`，后端会放入 `extra_body.image`：

```json
{
  "extra_body": {
    "image": [
      "https://example.com/input.png"
    ],
    "response_format": "url"
  }
}
```

## 响应解析

支持两类结果：

```json
{
  "data": [
    { "url": "https://example.com/result.png" }
  ]
}
```

```json
{
  "data": [
    { "b64_json": "iVBORw0KGgo..." }
  ]
}
```

后端会把 URL 或 Base64 结果转存到本地文件库，生成记录最终返回 `/storage/generated/image/...`。

## 尺寸

当前后端对 Agnes 图片模型内置推荐尺寸：

- `1024x768`
- `1024x1024`
- `1344x768`
- `768x1344`

如果后台模型配置了 `defaultParams.sizes` 或 `maxParams.sizes`，以前台配置为准。

## 注意事项

- 不要把 `response_format` 放在顶层，建议放在 `extra_body`。
- 文生图 Base64 可使用 `return_base64: true`。
- 图生图 Base64 可使用 `extra_body.response_format: "b64_json"`。
- 转存失败会导致生成失败并退款，不会保留上游临时 URL 作为成功结果。
- 图片模型后端最低消耗 1 金币。
