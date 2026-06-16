/**
 * Chat API | 对话 API
 */

import { request, getBaseUrl } from '@/utils'

// 对话补全
export const chatCompletions = (data) =>
  request({
    url: `/chat/completions`,
    method: 'post',
    data,
    headers: { 'X-Service-Type': 'chat' }
  })

// 流式对话补全
export const streamChatCompletions = async function* (data, signal, options = {}) {
  // 安全解析 JSON localStorage 项
  const parseStored = (key, fallback) => {
    try {
      const v = localStorage.getItem(key)
      return v ? JSON.parse(v) : fallback
    } catch {
      return fallback
    }
  }

  // 优先使用传入的 apiKey，否则按 chat 服务配置解析
  let apiKey = options.apiKey || ''
  if (!apiKey) {
    const serviceApiKeys = parseStored('service-api-keys', {})
    apiKey = serviceApiKeys.chat || ''
    if (!apiKey) {
      const serviceProviders = parseStored('service-providers', {})
      const provider = serviceProviders.chat || localStorage.getItem('api-provider') || 'openai'
      const apiKeysByProvider = parseStored('api-keys-by-provider', {})
      apiKey = apiKeysByProvider[provider] || ''
    }
    if (!apiKey) {
      apiKey = localStorage.getItem('apiKey') || ''
    }
  }

  // 解析本次请求的 provider(用于判定是否走代理)
  const serviceProviders = parseStored('service-providers', {})
  const provider = serviceProviders.chat || localStorage.getItem('api-provider') || 'openai'

  // 优先使用传入的 baseUrl，否则按 chat 服务配置解析
  let baseUrl = options.baseUrl
  if (!baseUrl) {
    const serviceBaseUrls = parseStored('service-base-urls', {})
    baseUrl = serviceBaseUrls.chat || ''
    if (!baseUrl) {
      const baseUrlsByProvider = parseStored('base-urls-by-provider', {})
      baseUrl = baseUrlsByProvider[provider] || ''
    }
    if (!baseUrl) {
      baseUrl = getBaseUrl()
    }
  }

  // 使用 options.endpoint 或默认的 /chat/completions
  const endpoint = options.endpoint || '/chat/completions'

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ ...data, stream: true }),
    signal
  })

  if (!response.ok) {
    // 先读文本再尝试解析，避免上游返回非 JSON（HTML 错误页、502 等）时抛 SyntaxError 丢失状态码
    const raw = await response.text()
    let message = `Stream request failed (${response.status})`
    try {
      const error = JSON.parse(raw)
      message = error?.error?.message || error?.message || message
    } catch {
      // 非 JSON 响应，若为文本错误信息则展示，否则保留默认
      if (raw) message = raw.slice(0, 200)
    }
    throw new Error(message)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) continue

      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') return

      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content
        if (content) yield content
      } catch (e) {
        // Skip invalid JSON
      }
    }
  }
}
