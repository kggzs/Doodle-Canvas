/**
 * Constants | 常量配置
 */

// API Base URL | API 基础 URL
export const DEFAULT_API_BASE_URL = 'https://api.openai.com/v1'

// API Endpoints | API 端点
export const API_ENDPOINTS = {
  // Model | 模型
  MODEL_PAGE: '/model/page',
  MODEL_FULL_NAME: '/model/fullName',
  MODEL_TYPES: '/model/types',
  
  // Image | 图片
  IMAGE_GENERATIONS: '/images/generations',
  
  // Video | 视频
  VIDEO_GENERATIONS: '/videos',
  VIDEO_TASK: '/videos',
  
  // Chat | 对话
  CHAT_COMPLETIONS: '/chat/completions'
}

// Error Codes | 错误码
export const ERROR_CODES = {
  INVALID_API_KEY: 'INVALID_API_KEY',
  RATE_LIMIT: 'RATE_LIMIT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN'
}

// Video Poll Config | 视频轮询配置
export const VIDEO_POLL_CONFIG = {
  MAX_ATTEMPTS: 120,
  POLL_INTERVAL: 5000
}

// Default Chat Config | 默认问答配置
export const DEFAULT_CHAT_CONFIG = {
  supportImage: false,
  supportFile: false,
  supportWeb: false,
  supportDeepThink: false
}

// Local Storage Keys | 本地存储键
// (完整定义，同步 stores/pinia/models.js)
export const STORAGE_KEYS = {
  // Legacy single-key config (useApiConfig.js)
  API_KEY: 'apiKey',
  BASE_URL: 'apiBaseUrl',

  // Provider config
  PROVIDER: 'api-provider',

  // Custom models (global, no provider)
  CUSTOM_CHAT_MODELS: 'custom-chat-models',
  CUSTOM_IMAGE_MODELS: 'custom-image-models',
  CUSTOM_VIDEO_MODELS: 'custom-video-models',

  // Custom models by provider
  CUSTOM_CHAT_MODELS_BY_PROVIDER: 'custom-chat-models-by-provider',
  CUSTOM_IMAGE_MODELS_BY_PROVIDER: 'custom-image-models-by-provider',
  CUSTOM_VIDEO_MODELS_BY_PROVIDER: 'custom-video-models-by-provider',

  // Selected model per type
  SELECTED_CHAT_MODEL: 'selected-chat-model',
  SELECTED_IMAGE_MODEL: 'selected-image-model',
  SELECTED_VIDEO_MODEL: 'selected-video-model',

  // API config by provider
  API_KEYS_BY_PROVIDER: 'api-keys-by-provider',
  BASE_URLS_BY_PROVIDER: 'base-urls-by-provider',

  // Service-scoped config (chat/image/video independent)
  SERVICE_PROVIDERS: 'service-providers',
  SERVICE_API_KEYS: 'service-api-keys',
  SERVICE_BASE_URLS: 'service-base-urls'
}
