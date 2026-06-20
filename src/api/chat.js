/**
 * Chat API | 对话 API
 * 只调用后端代理，API Key / Base URL 均由管理端配置。
 */

import backend, { authStorage, ensureFreshAccessToken } from '@/utils/backend'

// 对话补全
export const chatCompletions = (data) => backend.post('/chat/completions', data)

// 流式对话补全
export const streamChatCompletions = async function* (data, signal) {
  let response
  try {
    const createStreamRequest = async ({ forceRefresh = false } = {}) => {
      const token = await ensureFreshAccessToken({ force: forceRefresh })
      return fetch('/api/chat/completions/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ ...data, stream: true }),
        signal
      })
    }

    try {
      response = await createStreamRequest()
      if (response.status === 401 && authStorage.hasUsableRefreshToken()) {
        response = await createStreamRequest({ forceRefresh: true })
      }
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      throw new Error('网络连接异常，请稍后再试')
    }

    if (!response.ok) {
      const raw = await response.text()
      let message = '生成失败，请稍后再试'
      try {
        const parsed = JSON.parse(raw)
        message = parsed?.message || message
      } catch {
        // keep friendly message
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

        const text = trimmed.slice(5).trim()
        if (text === '[DONE]') return

        try {
          const parsed = JSON.parse(text)
          if (parsed?.code && parsed?.message) {
            const eventError = new Error(parsed.message)
            eventError.isStreamEventError = true
            throw eventError
          }
          const content = parsed.choices?.[0]?.delta?.content
            || parsed.choices?.[0]?.message?.content
            || parsed.delta?.content
          if (content) yield content
        } catch (err) {
          if (err?.isStreamEventError) throw err
          // Skip invalid JSON chunks.
        }
      }
    }
  } finally {
    window.dispatchEvent(new CustomEvent('doodle-balance-refresh'))
  }
}
