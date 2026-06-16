/**
 * API Hooks | API Hooks
 * Simplified hooks for open source version | 开源版简化 hooks
 */

import { ref, reactive, onUnmounted } from 'vue'
import {
  generateImage,
  createVideoTask,
  getVideoTaskStatus,
  streamChatCompletions
} from '@/api'
import { getModelByName } from '@/config/models'
import { useModelStore } from '@/stores/pinia'
import { cacheImage } from '@/utils/imageCache'

/**
 * Base API state hook | 基础 API 状态 Hook
 */
export const useApiState = () => {
  const loading = ref(false)
  const error = ref(null)
  const status = ref('idle')

  const reset = () => {
    loading.value = false
    error.value = null
    status.value = 'idle'
  }

  const setLoading = (isLoading) => {
    loading.value = isLoading
    status.value = isLoading ? 'running' : status.value
  }

  const setError = (err) => {
    error.value = err
    status.value = 'error'
    loading.value = false
  }

  const setSuccess = () => {
    status.value = 'success'
    loading.value = false
    error.value = null
  }

  return { loading, error, status, reset, setLoading, setError, setSuccess }
}

/**
 * Chat composable | 问答组合式函数
 */
export const useChat = (options = {}) => {
  const { loading, error, status, reset, setLoading, setError, setSuccess } = useApiState()
  const modelStore = useModelStore()
  const { adaptRequest, adaptResponse } = modelStore

  const messages = ref([])
  const currentResponse = ref('')
  let abortController = null

  const send = async (content, stream = true, chatOptions = {}) => {
    setLoading(true)
    currentResponse.value = ''

    try {
      // 构建用户消息内容（支持参考图片）
      let userContent
      const images = chatOptions.images || options.images || []

      if (images.length > 0) {
        // 多模态消息：文本 + 图片
        userContent = [
          { type: 'text', text: content },
          ...images.map(img => ({
            type: 'image_url',
            image_url: { url: img.url || img }
          }))
        ]
      } else {
        userContent = content
      }

      const msgList = [
        ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
        ...messages.value,
        { role: 'user', content: userContent }
      ]

      // 解析 chat 服务的最终 provider, 用其 requestAdapter 转换参数(chatOptions.model 可覆盖默认模型)
      const chatCfg = modelStore.getServiceConfig('chat')
      const chatAdapter = chatCfg.providerConfig?.requestAdapter?.chat
      const adaptedParams = chatAdapter
        ? chatAdapter({ model: chatOptions.model || options.model || 'gpt-4o-mini', messages: msgList })
        : adaptRequest('chat', { model: chatOptions.model || options.model || 'gpt-4o-mini', messages: msgList })

      if (stream) {
        status.value = 'streaming'
        abortController = new AbortController()
        let fullResponse = ''

        // 获取聊天端点(基于 chat 服务 provider)
        const chatUrl = modelStore.getChatEndpoint()
        // chatUrl 可能是完整 URL 或纯路径（阿里云走代理时只返回路径）
        let streamBaseUrl, streamEndpoint
        if (chatUrl.startsWith('http')) {
          streamBaseUrl = new URL(chatUrl).origin
          streamEndpoint = new URL(chatUrl).pathname
        } else {
          // 纯路径：使用当前页面 origin + 路径（走 Vite 代理）
          streamBaseUrl = window.location.origin
          streamEndpoint = chatUrl
        }

        // 获取 chat 服务的 API Key
        const currentApiKey = chatCfg.apiKey

        for await (const chunk of streamChatCompletions(
          adaptedParams,
          abortController.signal,
          { baseUrl: streamBaseUrl, endpoint: streamEndpoint, apiKey: currentApiKey }
        )) {
          fullResponse += chunk
          currentResponse.value = fullResponse
        }

        messages.value.push({ role: 'user', content })
        messages.value.push({ role: 'assistant', content: fullResponse })
        setSuccess()
        return fullResponse
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err)
        throw err
      }
    }
  }

  const stop = () => {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  const clear = () => {
    messages.value = []
    currentResponse.value = ''
    reset()
  }

  onUnmounted(() => stop())

  return { loading, error, status, messages, currentResponse, send, stop, clear, reset }
}

/**
 * Image generation composable | 图片生成组合式函数
 * Simplified for open source - fixed input/output format
 */
export const useImageGeneration = () => {
  const { loading, error, status, reset, setLoading, setError, setSuccess } = useApiState()
  const modelStore = useModelStore()
  const { adaptRequest, adaptResponse } = modelStore

  const images = ref([])
  const currentImage = ref(null)

  /**
   * Generate image with fixed params | 固定参数生成图片
   * @param {Object} params - { model, prompt, size, n, image (optional ref image) }
   */
  const generate = async (params) => {
    setLoading(true)
    images.value = []
    currentImage.value = null

    try {
      const modelConfig = getModelByName(params.model)

      // Build request data | 构建请求数据
      const requestData = {
        model: params.model,
        prompt: params.prompt,
        size: params.size || modelConfig?.defaultParams?.size || '2048x2048',
        n: params.n || 1
      }

      // Add reference image if provided | 添加参考图
      if (params.image) {
        requestData.image = params.image
      }

      // 万相模型不支持 quality/style 参数，仅传万相专用参数
      const isWanModel = params.model && params.model.startsWith('wan')
      if (!isWanModel) {
        if (params.quality) requestData.quality = params.quality
        if (params.style) requestData.style = params.style
      } else {
        // 万相模型：透传 thinking_mode
        if (modelConfig?.defaultParams?.thinking_mode !== undefined) {
          requestData.thinking_mode = modelConfig.defaultParams.thinking_mode
        }
      }

      // 透传模型默认参数中的通用字段（适用于所有模型，如 watermark）
      if (modelConfig?.defaultParams) {
        const genericFields = ['watermark', 'prompt_extend']
        for (const key of genericFields) {
          if (modelConfig.defaultParams[key] !== undefined && requestData[key] === undefined) {
            requestData[key] = modelConfig.defaultParams[key]
          }
        }
      }

      // 解析 image 服务的最终 provider, 用其 requestAdapter 转换参数
      const imgCfg = modelStore.getServiceConfig('image')
      const imgRequestAdapter = imgCfg.providerConfig?.requestAdapter?.image
      const adaptedParams = imgRequestAdapter
        ? imgRequestAdapter(requestData)
        : adaptRequest('image', requestData)

      // 当前 image 服务的 provider 和模型名称
      const currentProvider = imgCfg.provider
      const modelName = params.model

      // 调试日志:确认只调用一次
      if (import.meta.env.DEV) {
        console.log(`[useImageGeneration] 开始生成, provider=${currentProvider}, model=${modelName}`)
      }

      // Call API | 调用 API
      const response = await generateImage(adaptedParams, {
        requestType: 'json',
        endpoint: modelStore.getImageEndpoint(),
        provider: currentProvider,
        model: modelName
      })

      // 用 image 服务 provider 的 responseAdapter 适配响应数据
      const imgResponseAdapter = imgCfg.providerConfig?.responseAdapter?.image
      const adaptedData = imgResponseAdapter
        ? imgResponseAdapter(response)
        : adaptResponse('image', response)

      // 异步缓存生成的图片到 IndexedDB（不阻塞返回）
      if (adaptedData && adaptedData.length > 0) {
        for (const item of adaptedData) {
          if (item.url && !item.url.startsWith('data:')) {
            cacheImage(item.url).catch(() => {})
          }
        }
      }

      images.value = adaptedData
      currentImage.value = adaptedData[0] || null
      setSuccess()
      return adaptedData
    } catch (err) {
      setError(err)
      throw err
    }
  }

  return { loading, error, status, images, currentImage, generate, reset }
}

/**
 * Video generation composable | 视频生成组合式函数
 * Simplified for open source - fixed input/output format
 */

export const useVideoGeneration = () => {
  const { loading, error, status, reset, setLoading, setError, setSuccess } = useApiState()
  const modelStore = useModelStore()
  const { adaptRequest, adaptResponse } = modelStore

  const video = ref(null)
  const taskId = ref(null)
  const progress = reactive({
    attempt: 0,
    maxAttempts: 120,
    percentage: 0
  })

  /**
   * Create video task only (no polling) | 仅创建视频任务（不轮询）
   */
  const createVideoTaskOnly = async (params) => {
    const modelConfig = getModelByName(params.model)

    // 判断是否为阿里云万相模型
    const isAliyunWan = params.model && params.model.startsWith('wan2.7')

    // Build request data | 构建请求数据
    const requestData = {
      model: params.model,
      prompt: params.prompt || ''
    }

    if (isAliyunWan) {
      // 阿里云万相视频模型：使用 resolution/duration/media 格式
      if (params.first_frame_image) requestData.first_frame_image = params.first_frame_image
      if (params.last_frame_image) requestData.last_frame_image = params.last_frame_image
      if (params.resolution) requestData.resolution = params.resolution
      if (params.duration) requestData.duration = params.duration
      // 透传万相专用参数
      if (modelConfig?.defaultParams?.watermark !== undefined) {
        requestData.watermark = modelConfig.defaultParams.watermark
      }
      if (modelConfig?.defaultParams?.prompt_extend !== undefined) {
        requestData.prompt_extend = modelConfig.defaultParams.prompt_extend
      }
    } else {
      // 其他模型：使用 size/seconds 格式
      if (params.first_frame_image) requestData.first_frame_image = params.first_frame_image
      if (params.last_frame_image) requestData.last_frame_image = params.last_frame_image
      if (params.ratio) requestData.size = params.ratio
      if (params.dur) requestData.seconds = params.dur
    }

    // 解析 video 服务的最终 provider, 用其 requestAdapter 转换参数
    const vidCfg = modelStore.getServiceConfig('video')
    const vidRequestAdapter = vidCfg.providerConfig?.requestAdapter?.video
    const adaptedParams = vidRequestAdapter
      ? vidRequestAdapter(requestData)
      : adaptRequest('video', requestData)

    // Call API to create task | 调用 API 创建任务
    const task = await createVideoTask(adaptedParams, {
      requestType: 'json',
      endpoint: modelStore.getVideoEndpoint(),
      provider: vidCfg.provider,
      model: params.model
    })

    // 阿里云万相：直接从创建响应中提取 task_id（不走适配器，避免与轮询响应混淆）
    if (isAliyunWan) {
      const taskId = task.output?.task_id
      if (taskId) {
        return { taskId }
      }

      // 如果创建时就返回了视频URL（同步模式）
      const videoUrl = task.output?.video_url
      if (videoUrl) {
        return { taskId: null, url: videoUrl }
      }

      throw new Error('未获取到任务 ID')
    }

    // 其他模型：原有逻辑
    const isAsync = modelConfig?.async !== false
    if (!isAsync || task.data?.url || task.url || task.content?.video_url) {
      return {
        taskId: null,
        url: task.data?.url || task.url || task.content?.video_url
      }
    }

    const newTaskId = task.id || task.task_id || task.taskId
    if (!newTaskId) {
      throw new Error('未获取到任务 ID')
    }

    return { taskId: newTaskId }
  }

  /**
   * Poll video task | 轮询视频任务
   */
  const pollVideoTask = async (pollTaskId, onProgress = () => {}) => {
    const maxAttempts = 60
    const interval = 30000

    for (let i = 0; i < maxAttempts; i++) {
      // 先等待再查询，避免任务刚创建就发起无效查询
      await new Promise(resolve => setTimeout(resolve, interval))

      onProgress(i + 1, Math.min(Math.round((i / maxAttempts) * 100), 99))

      // 获取任务查询端点（含 {taskId} 占位符），由 getVideoTaskStatus 内部替换
      const taskEndpoint = modelStore.getVideoTaskEndpoint()

      const result = await getVideoTaskStatus(pollTaskId, {
        endpoint: taskEndpoint
      })

      // 适配轮询响应(用 video 服务 provider 的 responseAdapter)
      const vidResponseAdapter = modelStore.getServiceConfig('video').providerConfig?.responseAdapter?.video
      const adaptedResult = vidResponseAdapter
        ? vidResponseAdapter(result)
        : adaptResponse('video', result)

      // 阿里云万相：检查 task_status
      if (adaptedResult.status === 'completed') {
        return { ...adaptedResult }
      }

      if (adaptedResult.status === 'failed') {
        throw new Error(adaptedResult.error || result.output?.message || result.message || '视频生成失败')
      }

      // 其他模型：检查原有格式
      if (result.status === 'completed' || result.status === 'succeeded' || result.data) {
        const videoUrl = adaptedResult.url || result.data?.url || result.data?.[0]?.url || result.url || result.content?.video_url || result.video_url
        return { ...adaptedResult, url: videoUrl }
      }

      if (result.status === 'failed' || result.status === 'error') {
        throw new Error(result.error?.message || result.message || '视频生成失败')
      }
    }

    throw new Error('视频生成超时')
  }

  /**
   * Generate video with fixed params (includes polling) | 固定参数生成视频（含轮询）
   * @param {Object} params - { model, prompt, first_frame_image, last_frame_image, ratio, duration }
   */
  const generate = async (params) => {
    setLoading(true)
    video.value = null
    taskId.value = null
    progress.attempt = 0
    progress.percentage = 0

    try {
      // 创建任务
      const { taskId: newTaskId, url } = await createVideoTaskOnly(params)

      // 如果有直接 URL，返回
      if (url) {
        video.value = { url }
        setSuccess()
        return video.value
      }

      // 需要轮询
      taskId.value = newTaskId
      status.value = 'polling'

      // 轮询获取结果
      const result = await pollVideoTask(newTaskId, (attempt, percentage) => {
        progress.attempt = attempt
        progress.percentage = percentage
      })

      video.value = result
      setSuccess()
      return result
    } catch (err) {
      setError(err)
      throw err
    }
  }

  return { loading, error, status, video, taskId, progress, generate, reset, createVideoTaskOnly, pollVideoTask }
}

/**
 * Combined API composable | 综合 API 组合式函数
 */
export const useApi = () => {
  const chat = useChat()
  const image = useImageGeneration()
  const videoGen = useVideoGeneration()

  return { chat, image, video: videoGen }
}
