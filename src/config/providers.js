/**
 * API Provider Adapters | API 渠道适配器
 * 适配不同 API 提供商的请求参数和响应格式
 */

// 渠道适配配置
export const PROVIDERS = {
  openai: {
    label: 'OpenAI',
    defaultBaseUrl: 'https://ai.kggzs.cn',
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
      chat: '/api/v3/responses',
      image: '/api/v3/images/generations',
      video: '暂不支持',
      videoQuery: '暂不支持',
    },
    // 请求参数适配
    requestAdapter: {
      chat: (params) => {
        // 豆包使用 OpenAI Responses API 格式 (input 代替 messages)
        const adapted = {
          model: params.model,
          input: (params.messages || []).map(msg => {
            const content = typeof msg.content === 'string'
              ? [{ type: 'input_text', text: msg.content }]
              : msg.content
            return { role: msg.role, content }
          }),
        }
        if (params.temperature !== undefined) adapted.temperature = params.temperature
        if (params.max_tokens !== undefined) adapted.max_tokens = params.max_tokens
        if (params.stream !== undefined) adapted.stream = params.stream
        if (params.tools) adapted.tools = params.tools
        return adapted
      },
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
    // 响应数据适配
    responseAdapter: {
      chat: (response) => {
        // Responses API 响应格式：output[] 中包含 assistant 消息
        const output = response.output || []
        for (const msg of output) {
          if (msg.role === 'assistant' && msg.content) {
            const texts = msg.content
              .filter(c => c.type === 'output_text')
              .map(c => c.text)
            if (texts.length > 0) return texts.join('')
          }
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
    }
  },

  stepfun: {
    label: '阶跃星辰 (StepFun)',
    defaultBaseUrl: 'https://api.stepfun.com/step_plan',
    endpoints: {
      chat: '/v1/chat/completions',
      image: '/v1/images/generations',
      imageEdit: '/v1/images/edits',
      video: '暂不支持',
      videoQuery: '暂不支持',
    },
    requestAdapter: {
      chat: (params) => {
        const adapted = {
          model: params.model,
          messages: params.messages || []
        }
        if (params.temperature !== undefined) adapted.temperature = params.temperature
        if (params.max_tokens !== undefined) adapted.max_tokens = params.max_tokens
        if (params.stream !== undefined) adapted.stream = params.stream
        if (params.tools) adapted.tools = params.tools
        return adapted
      },
      image: (params) => {
        const adapted = {
          model: params.model,
          prompt: params.prompt,
          response_format: params.response_format || 'b64_json',
          cfg_scale: params.cfg_scale,
          steps: params.steps,
          seed: params.seed,
          text_mode: params.text_mode
        }
        if (params.size) adapted.size = params.size
        if (params.n) adapted.n = params.n
        if (params.image) adapted.image = params.image
        return adapted
      },
    },
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
    }
  },

  agnes: {
    label: 'Agnes AI',
    defaultBaseUrl: 'https://apihub.agnes-ai.com',
    endpoints: {
      chat: '/v1/chat/completions',
      image: '/v1/images/generations',
      video: '/v1/videos',
      videoQuery: '/agnesapi?video_id={taskId}'
    },
    requestAdapter: {
      chat: (params) => {
        const adapted = {
          model: params.model,
          messages: params.messages || []
        }
        if (params.temperature !== undefined) adapted.temperature = params.temperature
        if (params.max_tokens !== undefined) adapted.max_tokens = params.max_tokens
        if (params.stream !== undefined) adapted.stream = params.stream
        if (params.tools) adapted.tools = params.tools
        if (params.chat_template_kwargs) adapted.chat_template_kwargs = params.chat_template_kwargs
        return adapted
      },
      image: (params) => {
        const images = Array.isArray(params.image)
          ? params.image
          : params.image
            ? [params.image]
            : []
        const adapted = {
          model: params.model,
          prompt: params.prompt,
          size: params.size || '1024x768',
          extra_body: {
            response_format: params.response_format || 'url'
          }
        }
        if (images.length) adapted.extra_body.image = images
        if (params.return_base64 !== undefined) adapted.return_base64 = params.return_base64
        return adapted
      },
      video: (params) => {
        const images = Array.isArray(params.images) ? params.images : []
        const firstFrame = params.first_frame_image || images[0]
        const referenceImages = images.length > 1 ? images : firstFrame ? [firstFrame] : []
        const adapted = {
          model: params.model,
          prompt: params.prompt || '',
          width: params.width || 1152,
          height: params.height || 768,
          num_frames: params.num_frames || 121,
          frame_rate: params.frame_rate || 24
        }
        if (referenceImages.length === 1) adapted.image = referenceImages[0]
        if (referenceImages.length > 1) adapted.extra_body = { image: referenceImages }
        if (params.negative_prompt) adapted.negative_prompt = params.negative_prompt
        if (params.seed !== undefined) adapted.seed = params.seed
        return adapted
      }
    },
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
      video: (response) => ({
        url: response.remixed_from_video_id || response.video_url || response.url || '',
        taskId: response.video_id || response.task_id || response.id || '',
        status: response.status,
        ...response
      })
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
