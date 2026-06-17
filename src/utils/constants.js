/**
 * Constants | 常量配置
 */

// API Endpoints | API 端点
export const API_ENDPOINTS = {
  // Image | 图片
  IMAGE_GENERATIONS: '/api/generate/image',
  
  // Video | 视频
  VIDEO_GENERATIONS: '/api/generate/video',
  VIDEO_TASK: '/api/generate/video',
  
  // Chat | 对话
  CHAT_COMPLETIONS: '/api/chat/completions'
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
export const STORAGE_KEYS = {
  // Legacy provider key is kept only for reading old custom model buckets.
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
  SELECTED_VIDEO_MODEL: 'selected-video-model'
}
