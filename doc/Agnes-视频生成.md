# Agnes 视频生成接入笔记

> Provider：`agnes`
> 模型类型：`video`
> 推荐模型：`agnes-video-v2.0`

## 后台配置

在 `/admin/models/video` 中配置：

| 字段 | 建议值 |
| --- | --- |
| Provider | `agnes` |
| API 地址 | `https://apihub.agnes-ai.com` |
| 创建任务路径 | `/v1/videos` |
| 查询任务路径 | `/agnesapi?video_id={taskId}` |
| 调用模型名称 | `agnes-video-v2.0` |
| 用户显示名称 | `Agnes Video V2.0` |

如果页面只提供一个 API 路径，可在渠道配置 JSON 中写：

```json
{
  "endpoints": {
    "video": "/v1/videos",
    "videoQuery": "/agnesapi?video_id={taskId}"
  }
}
```

## 能力

- 文生视频。
- 图生视频。
- 多图视频生成。
- 关键帧动画。
- 异步任务查询。

## 创建任务

后端会向 `/v1/videos` 发送类似请求：

```json
{
  "model": "agnes-video-v2.0",
  "prompt": "A cinematic shot of a cat walking on the beach at sunset",
  "image": "https://example.com/input.png",
  "height": 768,
  "width": 1152,
  "num_frames": 121,
  "frame_rate": 24
}
```

多图或关键帧可通过默认参数或前端参数透传：

```json
{
  "extra_body": {
    "image": [
      "https://example.com/keyframe1.png",
      "https://example.com/keyframe2.png"
    ],
    "mode": "keyframes"
  }
}
```

## 任务响应

创建任务可能返回：

```json
{
  "task_id": "task_xxx",
  "video_id": "video_xxx",
  "status": "queued"
}
```

后端优先使用 `video_id` 或 `task_id` 作为查询 ID，并把任务元数据写入 Redis。

## 查询结果

查询完成时，Agnes 常见返回：

```json
{
  "status": "completed",
  "video_id": "video_xxx",
  "remixed_from_video_id": "https://example.com/result.mp4"
}
```

后端会识别 `remixed_from_video_id`、`video_url`、`data.url` 或 `url`，并转存为 `/storage/generated/video/...`。

## 参数建议

| 场景 | 建议 |
| --- | --- |
| 标准横屏 | `width=1152`、`height=768`、`num_frames=121`、`frame_rate=24` |
| 短视频 | 使用竖屏尺寸，并控制 `num_frames` |
| 关键帧 | `extra_body.mode="keyframes"` |
| 可复现 | 设置固定 `seed` |

## 注意事项

- 视频生成可能是异步任务，前端需要轮询 `/api/generate/video/:taskId`。
- Redis 中的视频任务元数据默认保留 2 天。
- 查询完成后才会写入最终文件和完成生成记录。
- 转存失败会标记生成失败并退款。
