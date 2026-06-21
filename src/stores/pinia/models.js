/**
 * Pinia Store: Model Config | 模型配置 Store
 * 管理模型配置、渠道切换和模型选择
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import backend from '@/utils/backend'

// 存储键名
const STORAGE_KEYS = {
  PROVIDER: 'api-provider',
  CUSTOM_CHAT_MODELS: 'custom-chat-models',
  CUSTOM_IMAGE_MODELS: 'custom-image-models',
  CUSTOM_VIDEO_MODELS: 'custom-video-models',
  SELECTED_CHAT_MODEL: 'selected-chat-model',
  SELECTED_IMAGE_MODEL: 'selected-image-model',
  SELECTED_VIDEO_MODEL: 'selected-video-model',
  CUSTOM_CHAT_MODELS_BY_PROVIDER: 'custom-chat-models-by-provider',
  CUSTOM_IMAGE_MODELS_BY_PROVIDER: 'custom-image-models-by-provider',
  CUSTOM_VIDEO_MODELS_BY_PROVIDER: 'custom-video-models-by-provider'
}

/**
 * Get stored value from localStorage
 */
const getStored = (key, defaultValue = '') => {
  try {
    return localStorage.getItem(key) || defaultValue
  } catch {
    return defaultValue
  }
}

/**
 * Set stored value to localStorage
 */
const setStored = (key, value) => {
  try {
    if (value) {
      localStorage.setItem(key, value)
    } else {
      localStorage.removeItem(key)
    }
  } catch {
    // ignore
  }
}

/**
 * Get stored JSON value from localStorage
 */
const getStoredJson = (key, defaultValue = []) => {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : defaultValue
  } catch {
    return defaultValue
  }
}

/**
 * Set stored JSON value to localStorage
 */
const setStoredJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

const mapServerModel = (model, type) => {
  const actualModelKey = model.modelKey || model.model_key || ''
  const id = model.id || model.model_id || actualModelKey
  return {
    id,
    label: model.displayName || model.display_name || actualModelKey || id,
    key: id,
    modelKey: actualModelKey,
    provider: model.providers || [],
    availableChannels: model.availableChannels || model.available_channels || 0,
    defaultParams: model.defaultParams || model.default_params || {},
    maxParams: model.maxParams || model.max_params || {},
    description: model.description || '',
    isServer: true,
    modelType: model.modelType || model.model_type || type
  }
}

const matchesModelIdentifier = (model, value) => {
  if (!model || !value) return false
  return [model.key, model.id, model.modelKey, model.label].filter(Boolean).includes(value)
}

export const useModelStore = defineStore('model', () => {
  // 旧版按 provider 存储自定义模型，保留当前 provider 仅用于读取历史自定义模型。
  const currentProvider = ref(getStored(STORAGE_KEYS.PROVIDER, 'openai'))

  // ============ Custom Models 状态 | Custom Models State ============

  // 全局自定义模型（不区分渠道）
  const customChatModels = ref(getStoredJson(STORAGE_KEYS.CUSTOM_CHAT_MODELS, []))
  const customImageModels = ref(getStoredJson(STORAGE_KEYS.CUSTOM_IMAGE_MODELS, []))
  const customVideoModels = ref(getStoredJson(STORAGE_KEYS.CUSTOM_VIDEO_MODELS, []))

  // 按渠道存储的自定义模型 | 结构: { 'openai': [{key, label}], 'doubao': [{key, label}] }
  const customChatModelsByProvider = ref(getStoredJson(STORAGE_KEYS.CUSTOM_CHAT_MODELS_BY_PROVIDER, {}))
  const customImageModelsByProvider = ref(getStoredJson(STORAGE_KEYS.CUSTOM_IMAGE_MODELS_BY_PROVIDER, {}))
  const customVideoModelsByProvider = ref(getStoredJson(STORAGE_KEYS.CUSTOM_VIDEO_MODELS_BY_PROVIDER, {}))

  // 后端公开模型列表（由管理端模型配置 + 渠道绑定决定）
  const serverModels = ref({ image: [], video: [], chat: [] })
  const serverModelsLoaded = ref(false)
  const serverModelsLoading = ref(false)
  const serverModelsError = ref(null)

  // 选中的模型
  const selectedChatModel = ref(getStored(STORAGE_KEYS.SELECTED_CHAT_MODEL, ''))
  const selectedImageModel = ref(getStored(STORAGE_KEYS.SELECTED_IMAGE_MODEL, ''))
  const selectedVideoModel = ref(getStored(STORAGE_KEYS.SELECTED_VIDEO_MODEL, ''))

  /**
   * 判断某服务是否有可用后端模型。
   * @param {string} service - 'chat' | 'image' | 'video'
   * @returns {boolean}
   */
  const isServiceConfigured = (service) => (serverModels.value[service] || []).length > 0

  // ============ Computed: Public Models from backend ============
  const allChatModels = computed(() => serverModels.value.chat || [])
  const allImageModels = computed(() => serverModels.value.image || [])
  const allVideoModels = computed(() => serverModels.value.video || [])

  // ============ Computed: Available Models (filtered by provider) ============

  // 按渠道过滤的可用模型
  const availableChatModels = computed(() => allChatModels.value)

  const availableImageModels = computed(() => allImageModels.value)

  const availableVideoModels = computed(() => allVideoModels.value)

  // ============ Computed: Model Options for UI (all models, not filtered by provider) ============

  // 返回适合 n-dropdown 使用的选项格式（全部模型，不按渠道过滤）
  const allImageModelOptions = computed(() =>
    allImageModels.value.map(m => ({
      label: m.label,
      key: m.key
    }))
  )

  const allVideoModelOptions = computed(() =>
    allVideoModels.value.map(m => ({
      label: m.label,
      key: m.key
    }))
  )

  const allChatModelOptions = computed(() =>
    allChatModels.value.map(m => ({
      label: m.label,
      key: m.key
    }))
  )

  // ============ 校验选中的模型是否有效 ============

  // 校验选中的模型是否在当前模型列表中,不存在则重置为默认值
  const normalizeSelectedModel = (selectedRef, models) => {
    const current = selectedRef.value
    const matched = models.find(model => matchesModelIdentifier(model, current))
    selectedRef.value = matched?.key || models[0]?.key || ''
  }

  const validateSelectedModels = () => {
    normalizeSelectedModel(selectedImageModel, allImageModels.value)
    normalizeSelectedModel(selectedVideoModel, allVideoModels.value)
    normalizeSelectedModel(selectedChatModel, allChatModels.value)
  }

  // 初始化时校验一次
  validateSelectedModels()

  // ============ Computed: Model Options for UI (filtered by provider - deprecated, use all* instead) ============

  // 返回适合 n-dropdown 使用的选项格式
  const imageModelOptions = computed(() =>
    availableImageModels.value.map(m => ({
      label: m.label,
      key: m.key
    }))
  )

  const videoModelOptions = computed(() =>
    availableVideoModels.value.map(m => ({
      label: m.label,
      key: m.key
    }))
  )

  const chatModelOptions = computed(() =>
    availableChatModels.value.map(m => ({
      label: m.label,
      key: m.key
    }))
  )

  // ============ Methods: Add/Remove Custom Models ============

  const addCustomChatModel = (modelKey, label = '') => {
    if (!modelKey || customChatModels.value.some(m => m.key === modelKey)) return false
    customChatModels.value.push({ key: modelKey, label: label || modelKey })
    return true
  }

  const addCustomImageModel = (modelKey, label = '') => {
    if (!modelKey || customImageModels.value.some(m => m.key === modelKey)) return false
    customImageModels.value.push({ key: modelKey, label: label || modelKey })
    return true
  }

  const addCustomVideoModel = (modelKey, label = '') => {
    if (!modelKey || customVideoModels.value.some(m => m.key === modelKey)) return false
    customVideoModels.value.push({ key: modelKey, label: label || modelKey })
    return true
  }

  const removeCustomChatModel = (modelKey) => {
    const idx = customChatModels.value.findIndex(m => m.key === modelKey)
    if (idx > -1) {
      customChatModels.value.splice(idx, 1)
      if (selectedChatModel.value === modelKey) {
        selectedChatModel.value = allChatModels.value[0]?.key || ''
      }
      return true
    }
    return false
  }

  const removeCustomImageModel = (modelKey) => {
    const idx = customImageModels.value.findIndex(m => m.key === modelKey)
    if (idx > -1) {
      customImageModels.value.splice(idx, 1)
      if (selectedImageModel.value === modelKey) {
        selectedImageModel.value = allImageModels.value[0]?.key || ''
      }
      return true
    }
    return false
  }

  const removeCustomVideoModel = (modelKey) => {
    const idx = customVideoModels.value.findIndex(m => m.key === modelKey)
    if (idx > -1) {
      customVideoModels.value.splice(idx, 1)
      if (selectedVideoModel.value === modelKey) {
        selectedVideoModel.value = allVideoModels.value[0]?.key || ''
      }
      return true
    }
    return false
  }

  // ============ Methods: Get Model Config ============

  const getChatModel = (key) => allChatModels.value.find(m => matchesModelIdentifier(m, key))
  const getImageModel = (key) => allImageModels.value.find(m => matchesModelIdentifier(m, key))
  const getVideoModel = (key) => allVideoModels.value.find(m => matchesModelIdentifier(m, key))

  const loadPublicModels = async () => {
    if (serverModelsLoading.value) return serverModels.value
    serverModelsLoading.value = true
    serverModelsError.value = null
    try {
      const data = await backend.get('/models')
      serverModels.value = {
        image: (data?.image || []).map(item => mapServerModel(item, 'image')).filter(item => item.key),
        video: (data?.video || []).map(item => mapServerModel(item, 'video')).filter(item => item.key),
        chat: (data?.chat || []).map(item => mapServerModel(item, 'chat')).filter(item => item.key)
      }
      serverModelsLoaded.value = true
      validateSelectedModels()
      return serverModels.value
    } catch (err) {
      serverModelsError.value = err
      return serverModels.value
    } finally {
      serverModelsLoading.value = false
    }
  }

  // ============ Methods: Add/Remove Custom Models By Provider ============

  const addCustomChatModelByProvider = (modelKey, provider, label = '') => {
    if (!modelKey) return false
    if (!customChatModelsByProvider.value[provider]) {
      customChatModelsByProvider.value[provider] = []
    }
    if (customChatModelsByProvider.value[provider].some(m => m.key === modelKey)) return false
    customChatModelsByProvider.value[provider].push({ key: modelKey, label: label || modelKey })
    return true
  }

  const addCustomImageModelByProvider = (modelKey, provider, label = '') => {
    if (!modelKey) return false
    if (!customImageModelsByProvider.value[provider]) {
      customImageModelsByProvider.value[provider] = []
    }
    if (customImageModelsByProvider.value[provider].some(m => m.key === modelKey)) return false
    customImageModelsByProvider.value[provider].push({ key: modelKey, label: label || modelKey })
    return true
  }

  const addCustomVideoModelByProvider = (modelKey, provider, label = '') => {
    if (!modelKey) return false
    if (!customVideoModelsByProvider.value[provider]) {
      customVideoModelsByProvider.value[provider] = []
    }
    if (customVideoModelsByProvider.value[provider].some(m => m.key === modelKey)) return false
    customVideoModelsByProvider.value[provider].push({ key: modelKey, label: label || modelKey })
    return true
  }

  const removeCustomChatModelByProvider = (modelKey, provider) => {
    if (!customChatModelsByProvider.value[provider]) return false
    const idx = customChatModelsByProvider.value[provider].findIndex(m => m.key === modelKey)
    if (idx > -1) {
      customChatModelsByProvider.value[provider].splice(idx, 1)
      return true
    }
    return false
  }

  const removeCustomImageModelByProvider = (modelKey, provider) => {
    if (!customImageModelsByProvider.value[provider]) return false
    const idx = customImageModelsByProvider.value[provider].findIndex(m => m.key === modelKey)
    if (idx > -1) {
      customImageModelsByProvider.value[provider].splice(idx, 1)
      return true
    }
    return false
  }

  const removeCustomVideoModelByProvider = (modelKey, provider) => {
    if (!customVideoModelsByProvider.value[provider]) return false
    const idx = customVideoModelsByProvider.value[provider].findIndex(m => m.key === modelKey)
    if (idx > -1) {
      customVideoModelsByProvider.value[provider].splice(idx, 1)
      return true
    }
    return false
  }

  // 清除所有自定义模型
  const clearCustomModels = () => {
    customChatModels.value = []
    customImageModels.value = []
    customVideoModels.value = []
    selectedChatModel.value = allChatModels.value[0]?.key || ''
    selectedImageModel.value = allImageModels.value[0]?.key || ''
    selectedVideoModel.value = allVideoModels.value[0]?.key || ''
  }

  // ============ Methods: Clear Config Cache ============

  /**
   * 清除配置缓存(保留登录状态和主题)
   * 清除范围: 历史前端 API 配置、自定义模型、选中的模型
   * 保留范围: auth token、theme(主题)
   */
  const clearConfigCache = () => {
    // 需要清除的 localStorage 键
    const keysToClear = [
      STORAGE_KEYS.PROVIDER,
      STORAGE_KEYS.CUSTOM_CHAT_MODELS,
      STORAGE_KEYS.CUSTOM_IMAGE_MODELS,
      STORAGE_KEYS.CUSTOM_VIDEO_MODELS,
      STORAGE_KEYS.SELECTED_CHAT_MODEL,
      STORAGE_KEYS.SELECTED_IMAGE_MODEL,
      STORAGE_KEYS.SELECTED_VIDEO_MODEL,
      STORAGE_KEYS.CUSTOM_CHAT_MODELS_BY_PROVIDER,
      STORAGE_KEYS.CUSTOM_IMAGE_MODELS_BY_PROVIDER,
      STORAGE_KEYS.CUSTOM_VIDEO_MODELS_BY_PROVIDER,
      'apiKey',
      'api-keys-by-provider',
      'base-urls-by-provider',
      'service-providers',
      'service-api-keys',
      'service-base-urls'
    ]

    keysToClear.forEach(key => {
      try { localStorage.removeItem(key) } catch { /* ignore */ }
    })

    // 重置响应式状态
    currentProvider.value = 'openai'
    customChatModels.value = []
    customImageModels.value = []
    customVideoModels.value = []
    customChatModelsByProvider.value = {}
    customImageModelsByProvider.value = {}
    customVideoModelsByProvider.value = {}
    selectedChatModel.value = allChatModels.value[0]?.key || ''
    selectedImageModel.value = allImageModels.value[0]?.key || ''
    selectedVideoModel.value = allVideoModels.value[0]?.key || ''

    return true
  }

  // ============ Watch & Persist ============

  // 监听并持久化自定义模型
  watch(customChatModels, (val) => setStoredJson(STORAGE_KEYS.CUSTOM_CHAT_MODELS, val), { deep: true })
  watch(customImageModels, (val) => setStoredJson(STORAGE_KEYS.CUSTOM_IMAGE_MODELS, val), { deep: true })
  watch(customVideoModels, (val) => setStoredJson(STORAGE_KEYS.CUSTOM_VIDEO_MODELS, val), { deep: true })

  // 监听并持久化按渠道的自定义模型
  watch(customChatModelsByProvider, (val) => setStoredJson(STORAGE_KEYS.CUSTOM_CHAT_MODELS_BY_PROVIDER, val), { deep: true })
  watch(customImageModelsByProvider, (val) => setStoredJson(STORAGE_KEYS.CUSTOM_IMAGE_MODELS_BY_PROVIDER, val), { deep: true })
  watch(customVideoModelsByProvider, (val) => setStoredJson(STORAGE_KEYS.CUSTOM_VIDEO_MODELS_BY_PROVIDER, val), { deep: true })

  // 监听并持久化选中的模型
  watch(selectedChatModel, (val) => setStored(STORAGE_KEYS.SELECTED_CHAT_MODEL, val))
  watch(selectedImageModel, (val) => setStored(STORAGE_KEYS.SELECTED_IMAGE_MODEL, val))
  watch(selectedVideoModel, (val) => setStored(STORAGE_KEYS.SELECTED_VIDEO_MODEL, val))

  return {
    // All models from backend public configuration
    allChatModels,
    allImageModels,
    allVideoModels,

    // Available models filtered by provider
    availableChatModels,
    availableImageModels,
    availableVideoModels,

    // Model options for UI (dropdown format)
    imageModelOptions,
    videoModelOptions,
    chatModelOptions,

    // All model options (not filtered by provider)
    allImageModelOptions,
    allVideoModelOptions,
    allChatModelOptions,

    // Selected models
    selectedChatModel,
    selectedImageModel,
    selectedVideoModel,

    // Custom models
    customChatModels,
    customImageModels,
    customVideoModels,

    // Custom models by provider
    customChatModelsByProvider,
    customImageModelsByProvider,
    customVideoModelsByProvider,

    // Add/Remove methods
    addCustomChatModel,
    addCustomImageModel,
    addCustomVideoModel,
    removeCustomChatModel,
    removeCustomImageModel,
    removeCustomVideoModel,

    // Add/Remove by provider methods
    addCustomChatModelByProvider,
    addCustomImageModelByProvider,
    addCustomVideoModelByProvider,
    removeCustomChatModelByProvider,
    removeCustomImageModelByProvider,
    removeCustomVideoModelByProvider,

    // Get model
    getChatModel,
    getImageModel,
    getVideoModel,
    loadPublicModels,
    serverModels,
    serverModelsLoaded,
    serverModelsLoading,
    serverModelsError,

    // Clear all custom models
    clearCustomModels,

    // Clear config cache (preserve generated images)
    clearConfigCache,

    // Backend model availability
    isServiceConfigured
  }
})
