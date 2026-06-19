/**
 * Backend API client | 后端业务接口请求客户端
 * 用于调用同源 /api 业务接口，不接触第三方 AI Key / Base URL。
 */
import axios from 'axios'

const TOKEN_KEY = 'doodle-access-token'
const REFRESH_TOKEN_KEY = 'doodle-refresh-token'
const USER_KEY = 'doodle-current-user'

function emitAuthCleared() {
  window.dispatchEvent(new Event('doodle-auth-cleared'))
}

function clearStoredAuth({ emit = true } = {}) {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  if (emit) emitAuthCleared()
}

function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

function isExpiredOrInvalidAccessToken(token) {
  if (!token) return true
  const payload = decodeJwtPayload(token)
  if (!payload) return true
  if (!payload.exp) return false
  return payload.exp * 1000 <= Date.now() + 30000
}

export const authStorage = {
  getAccessToken: () => {
    const token = localStorage.getItem(TOKEN_KEY) || ''
    if (!token) return ''
    if (isExpiredOrInvalidAccessToken(token)) {
      clearStoredAuth()
      return ''
    }
    return token
  },
  setAccessToken: (token) => localStorage.setItem(TOKEN_KEY, token || ''),
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY) || '',
  setRefreshToken: (token) => localStorage.setItem(REFRESH_TOKEN_KEY, token || ''),
  getUser: () => {
    try {
      const token = localStorage.getItem(TOKEN_KEY) || ''
      if (!token || isExpiredOrInvalidAccessToken(token)) {
        clearStoredAuth()
        return null
      }
      const raw = localStorage.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },
  setUser: (user) => localStorage.setItem(USER_KEY, JSON.stringify(user || null)),
  clear: () => clearStoredAuth()
}

const backend = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_BASE_URL || '/api',
  timeout: 120000
})

function friendlyNetworkError(error) {
  if (error.code === 'ECONNABORTED') {
    return {
      code: 50401,
      message: '请求处理时间较长，请稍后在记录中查看结果',
      request_id: null
    }
  }
  if (!error.response) {
    return {
      code: 50201,
      message: '网络连接异常，请稍后再试',
      request_id: null
    }
  }
  return null
}

backend.interceptors.request.use((config) => {
  const token = authStorage.getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

backend.interceptors.response.use(
  (response) => {
    const body = response.data
    if (body?.code === 0) return body.data
    return Promise.reject(body)
  },
  (error) => {
    const body = error.response?.data
    if (error.response?.status === 401) {
      authStorage.clear()
    }
    return Promise.reject(body || friendlyNetworkError(error) || { message: '操作失败，请稍后再试' })
  }
)

export default backend
