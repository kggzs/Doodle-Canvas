/**
 * Chat API | 对话 API
 * 只调用后端代理，API Key / Base URL 均由管理端配置。
 */

import backend, { authStorage } from '@/utils/backend'

// 对话补全
export const chatCompletions = (data) => backend.post('/chat/completions', data)

// 流式对话补全
export const streamChatCompletions = async function* (data, signal) {
  const response = await fetch('/api/chat/completions/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authStorage.getAccessToken()
        ? { Authorization: `Bearer ${authStorage.getAccessToken()}` }
        : {})
    },
    body: JSON.stringify({ ...data, stream: true }),
    signal
  })

  if (!response.ok) {
    const raw = await response.text()
    let message = `Stream request failed (${response.status})`
    try {
      const parsed = JSON.parse(raw)
      message = parsed?.message || parsed?.error?.message || message
    } catch {
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

      const text = trimmed.slice(5).trim()
      if (text === '[DONE]') return

      try {
        const parsed = JSON.parse(text)
        const content = parsed.choices?.[0]?.delta?.content
          || parsed.choices?.[0]?.message?.content
          || parsed.delta?.content
        if (content) yield content
      } catch {
        // Skip invalid JSON chunks.
      }
    }
  }
}
