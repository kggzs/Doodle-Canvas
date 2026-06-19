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
import { currentProjectId } from '@/stores/canvas'

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

      const requestParams = {
        model: chatOptions.model || options.model || 'gpt-4o-mini',
        messages: msgList,
        project_id: chatOptions.projectId || options.projectId || currentProjectId.value || undefined
      }

      if (stream) {
        status.value = 'streaming'
        abortController = new AbortController()
        let fullResponse = ''

        for await (const chunk of streamChatCompletions(
          requestParams,
          abortController.signal
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
    } finally {
      window.dispatchEvent(new CustomEvent('doodle-balance-refresh'))
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
        n: params.n || 1,
        project_id: currentProjectId.value || undefined
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

      // 调试日志:确认只调用一次
      if (import.meta.env.DEV) {
        console.log(`[useImageGeneration] 开始生成, model=${params.model}`)
      }

      // Call API | 调用 API
      const response = await generateImage(requestData)
      const adaptedData = response.images || []

      images.value = adaptedData
      currentImage.value = adaptedData[0] || null
      setSuccess()
      return adaptedData
    } catch (err) {
      setError(err)
      throw err
    } finally {
      window.dispatchEvent(new CustomEvent('doodle-balance-refresh'))
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
      prompt: params.prompt || '',
      project_id: currentProjectId.value || undefined
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

    // Call API to create task | 调用 API 创建任务
    const task = await createVideoTask(requestData)

    if (task.url) {
      return {
        taskId: null,
        url: task.url
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

      const result = await getVideoTaskStatus(pollTaskId)

      if (result.status === 'completed') {
        return { ...result }
      }

      if (result.status === 'failed') {
        throw new Error('视频生成失败，请稍后再试')
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
    } finally {
      window.dispatchEvent(new CustomEvent('doodle-balance-refresh'))
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
