/**
 * API Provider Adapters | API 渠道适配器
 * 适配不同 API 提供商的请求参数和响应格式
 */

// 渠道适配配置
export const PROVIDERS = {
  openai: {
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.chatfire.cn',
    // 端点路径
    endpoints: {
      chat: '/v1/chat/completions',
      image: '/v1/images/generations',
      video: '/v1/videos',
      videoQuery: '/v1/videos/{taskId}'
    },
    // 请求参数适配
    requestAdapter: {
      chat: (params) => {
        const adapted = {
          model: params.model,
          messages: params.messages
        }
        // 添加可选参数
        if (params.temperature !== undefined) adapted.temperature = params.temperature
        if (params.max_tokens !== undefined) adapted.max_tokens = params.max_tokens
        if (params.stream !== undefined) adapted.stream = params.stream
        return adapted
      },
      image: (params) => {
        const adapted = {
          model: params.model,
          prompt: params.prompt
        }
        if (params.size) adapted.size = params.size
        if (params.n) adapted.n = params.n
        if (params.quality) adapted.quality = params.quality
        if (params.style) adapted.style = params.style
        if (params.image) adapted.image = params.image
        return adapted
      },
      video: (params) => {
        const adapted = {
          model: params.model,
          prompt: params.prompt || ''
        }
        if (params.first_frame_image) adapted.first_frame_image = params.first_frame_image
        if (params.last_frame_image) adapted.last_frame_image = params.last_frame_image
        if (params.size) adapted.size = params.size
        if (params.seconds) adapted.seconds = params.seconds
        return adapted
      }
    },
    // 响应数据适配
    responseAdapter: {
      chat: (response) => {
        if (response.choices && response.choices.length > 0) {
          return response.choices[0].message?.content || ''
        }
        return ''
      },
      image: (response) => {
        const data = response.data || response
        return (Array.isArray(data) ? data : [data]).map(item => ({
          url: item.url || item.b64_json || '',
          revisedPrompt: item.revised_prompt || ''
        }))
      },
      video: (response) => {
        return {
          url: response.data?.url || response.url || response.data?.[0]?.url || '',
          ...response
        }
      }
    }
  },
  aliyun: {
    label: '阿里云万相 (Aliyun Wan)',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    // 端点路径(北京域名)
    endpoints: {
      chat: '/v1/chat/completions',
      image: '/services/aigc/multimodal-generation/generation', // wan2.7 同步端点
      imageAsync: '/services/aigc/image-generation/generation', // wan2.7 异步端点
      imageQuery: '/tasks/{taskId}', // 异步任务查询
      video: '/services/aigc/video-generation/video-synthesis', // wan2.7 视频生成端点
      videoQuery: '/tasks/{taskId}' // 视频异步任务查询
    },
    // 阿里云万相请求适配
    requestAdapter: {
      chat: (params) => {
        const adapted = {
          model: params.model,
          messages: params.messages
        }
        if (params.temperature !== undefined) adapted.temperature = params.temperature
        if (params.max_tokens !== undefined) adapted.max_tokens = params.max_tokens
        if (params.stream !== undefined) adapted.stream = params.stream
        return adapted
      },
      image: (params) => {
        // wan2.7 统一使用 messages 格式，支持文生图和图生图
        const content = []

        // 图生图：将参考图按顺序添加到 content 前面
        if (params.image && Array.isArray(params.image) && params.image.length > 0) {
          for (const imgUrl of params.image) {
            content.push({ image: imgUrl })
          }
        }

        // 添加文本提示词
        content.push({ text: params.prompt || '' })

        const adapted = {
          model: params.model,
          input: {
            messages: [
              {
                role: 'user',
                content
              }
            ]
          },
          parameters: {}
        }

        // 添加可选参数
        if (params.size) adapted.parameters.size = params.size
        if (params.n) adapted.parameters.n = params.n
        // thinking_mode 仅在文生图（无图片输入）时生效
        if (params.thinking_mode !== undefined && (!params.image || params.image.length === 0)) {
          adapted.parameters.thinking_mode = params.thinking_mode
        }
        if (params.watermark !== undefined) adapted.parameters.watermark = params.watermark
        if (params.seed !== undefined) adapted.parameters.seed = params.seed

        return adapted
      },
      video: (params) => {
        // wan2.7 视频生成 API 格式
        // 图生视频(i2v): model + input.prompt + input.media + parameters
        // 文生视频(t2v): model + input.prompt + parameters
        const input = {
          prompt: params.prompt || ''
        }

        // 构建媒体素材数组（图生视频时使用）
        const media = []
        if (params.first_frame_image) {
          media.push({ type: 'first_frame', url: params.first_frame_image })
        }
        if (params.last_frame_image) {
          media.push({ type: 'last_frame', url: params.last_frame_image })
        }
        if (params.first_clip) {
          media.push({ type: 'first_clip', url: params.first_clip })
        }
        if (params.driving_audio) {
          media.push({ type: 'driving_audio', url: params.driving_audio })
        }
        if (media.length > 0) {
          input.media = media
        }

        const parameters = {}
        if (params.resolution) parameters.resolution = params.resolution
        if (params.duration) parameters.duration = params.duration
        if (params.prompt_extend !== undefined) parameters.prompt_extend = params.prompt_extend
        if (params.watermark !== undefined) parameters.watermark = params.watermark
        if (params.seed !== undefined) parameters.seed = params.seed

        const adapted = {
          model: params.model,
          input,
          parameters
        }
        return adapted
      }
    },
    // 阿里云万相响应格式
    responseAdapter: {
      chat: (response) => {
        if (response.choices && response.choices.length > 0) {
          return response.choices[0].message?.content || ''
        }
        return ''
      },
      image: (response) => {
        // 阿里云错误响应：包含 code 字段时表示失败
        if (response.code && response.code !== '200' && response.code !== '') {
          throw new Error(response.message || `阿里云 API 错误: ${response.code}`)
        }

        // 同步/异步调用成功响应：output.choices 结构一致
        if (response.output?.choices) {
          const choices = response.output.choices || []
          return choices.flatMap(choice =>
            (choice.message?.content || [])
              .filter(c => c.type === 'image' && c.image)
              .map(c => ({
                url: c.image,
                revisedPrompt: ''
              }))
          )
        }

        // 异步任务创建响应：返回 task_id 用于轮询
        if (response.output?.task_id) {
          return {
            taskId: response.output.task_id,
            taskStatus: response.output.task_status,
            isAsync: true
          }
        }

        return []
      },
      video: (response) => {
        // wan2.7 视频任务查询成功响应（优先检查 task_status，因为轮询响应也包含 task_id）
        if (response.output?.task_status === 'SUCCEEDED') {
          return {
            url: response.output.video_url || '',
            status: 'completed'
          }
        }

        // 任务处理中
        if (response.output?.task_status === 'PENDING' || response.output?.task_status === 'RUNNING') {
          return {
            status: response.output.task_status === 'PENDING' ? 'pending' : 'running',
            taskStatus: response.output.task_status
          }
        }

        // 任务失败
        if (response.output?.task_status === 'FAILED' || response.output?.task_status === 'UNKNOWN') {
          const errMsg = response.output?.message || response.message || '视频生成失败'
          return {
            status: 'failed',
            error: errMsg
          }
        }

        // wan2.7 视频生成异步任务创建响应（task_status 为 PENDING 时创建成功）
        if (response.output?.task_id) {
          return {
            taskId: response.output.task_id,
            taskStatus: response.output.task_status,
            isAsync: true
          }
        }

        // 兜底
        return {
          url: response.output?.video_url || response.data?.url || response.url || '',
          ...response
        }
      }
    }
  },

  doubao: {
    label: '豆包 (Doubao-Seedream)',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com',
    // 端点路径
    endpoints: {
      image: '/api/v3/images/generations',
    },
    // 请求参数适配
    requestAdapter: {
      image: (params) => {
        const adapted = {
          model: params.model,
          prompt: params.prompt,
          sequential_image_generation: params.sequential_image_generation || 'disabled',
          response_format: params.response_format || 'url',
          stream: params.stream !== undefined ? params.stream : false,
        }
        if (params.size) adapted.size = params.size
        if (params.n) adapted.n = params.n
        if (params.quality) adapted.quality = params.quality
        if (params.watermark !== undefined) adapted.watermark = params.watermark
        // 参考图：单张图片或图片数组
        if (params.image) adapted.image = params.image
        return adapted
      },
    },
    // 响应数据适配（复用 OpenAI 格式）
    responseAdapter: {
      image: (response) => {
        const data = response.data || response
        return (Array.isArray(data) ? data : [data]).map(item => ({
          url: item.url || item.b64_json || '',
          revisedPrompt: item.revised_prompt || ''
        }))
      },
    }
  },

  // 默认使用 OpenAI 格式
  default: 'openai'
}

// 获取渠道列表
export const getProviderList = () => {
  return Object.entries(PROVIDERS)
    .filter(([key]) => key !== 'default')
    .map(([key, value]) => ({
      key,
      label: value.label
    }))
}

// 获取默认渠道
export const getDefaultProvider = () => {
  return PROVIDERS.default || 'openai'
}

// 获取渠道的默认 Base URL
export const getDefaultBaseUrl = (providerKey) => {
  const config = getProviderConfig(providerKey)
  return config.defaultBaseUrl || ''
}

// 获取渠道配置
export const getProviderConfig = (providerKey) => {
  return PROVIDERS[providerKey] || PROVIDERS[PROVIDERS.default]
}
