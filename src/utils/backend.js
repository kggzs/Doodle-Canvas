/**
 * Backend API client | 后端业务接口请求客户端
 * 用于调用同源 /api 业务接口，不接触第三方 AI Key / Base URL。
 */
import axios from 'axios'

const TOKEN_KEY = 'doodle-access-token'
const REFRESH_TOKEN_KEY = 'doodle-refresh-token'
const USER_KEY = 'doodle-current-user'
const TOKEN_REFRESH_SKEW_MS = 30 * 1000
const backendBaseURL = import.meta.env.VITE_BACKEND_BASE_URL || '/api'
const PUBLIC_AUTH_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/verify-email',
  '/auth/resend-verification',
  '/auth/check-email',
  '/auth/forgot-password',
  '/auth/reset-password'
])

function emitAuthCleared() {
  window.dispatchEvent(new Event('doodle-auth-cleared'))
}

function emitAuthUpdated() {
  window.dispatchEvent(new CustomEvent('doodle-auth-updated', {
    detail: {
      accessToken: localStorage.getItem(TOKEN_KEY) || '',
      refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY) || '',
      user: readStoredUser()
    }
  }))
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

function isExpiredOrInvalidToken(token, skewMs = 0) {
  if (!token) return true
  const payload = decodeJwtPayload(token)
  if (!payload) return true
  if (!payload.exp) return false
  return payload.exp * 1000 <= Date.now() + skewMs
}

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function persistAuthSession(session = {}, { emit = true } = {}) {
  if (hasOwn(session, 'accessToken') || hasOwn(session, 'access_token')) {
    localStorage.setItem(TOKEN_KEY, session.accessToken || session.access_token || '')
  }
  if (hasOwn(session, 'refreshToken') || hasOwn(session, 'refresh_token')) {
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken || session.refresh_token || '')
  }
  if (hasOwn(session, 'user')) {
    localStorage.setItem(USER_KEY, JSON.stringify(session.user || null))
  }
  if (emit) emitAuthUpdated()
}

function hasUsableRefreshToken() {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY) || ''
  return Boolean(refreshToken && !isExpiredOrInvalidToken(refreshToken))
}

function needsAccessRefresh() {
  const accessToken = localStorage.getItem(TOKEN_KEY) || ''
  return !accessToken || isExpiredOrInvalidToken(accessToken, TOKEN_REFRESH_SKEW_MS)
}

function getRequestPath(config = {}) {
  const rawUrl = typeof config === 'string' ? config : config.url
  if (!rawUrl) return ''

  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    const path = new URL(rawUrl, base).pathname
    return path.startsWith('/api/') ? path.slice('/api'.length) : path
  } catch {
    return rawUrl
  }
}

function isRefreshRequest(config) {
  return getRequestPath(config) === '/auth/refresh'
}

function isPublicAuthRequest(config) {
  return PUBLIC_AUTH_PATHS.has(getRequestPath(config))
}

function shouldSkipProactiveRefresh(config) {
  return Boolean(config?.skipAuthRefresh || isRefreshRequest(config) || isPublicAuthRequest(config))
}

function shouldRetryWithRefresh(config) {
  return Boolean(!config?._authRetry && !config?.skipAuthRefresh && !isRefreshRequest(config) && !isPublicAuthRequest(config) && hasUsableRefreshToken())
}

export const authStorage = {
  getAccessToken: () => {
    return localStorage.getItem(TOKEN_KEY) || ''
  },
  setAccessToken: (token) => localStorage.setItem(TOKEN_KEY, token || ''),
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY) || '',
  setRefreshToken: (token) => localStorage.setItem(REFRESH_TOKEN_KEY, token || ''),
  getUser: () => {
    const user = readStoredUser()
    if (!user) return null

    const accessToken = localStorage.getItem(TOKEN_KEY) || ''
    if (accessToken && !isExpiredOrInvalidToken(accessToken)) return user
    if (hasUsableRefreshToken()) return user

    if (accessToken || localStorage.getItem(REFRESH_TOKEN_KEY)) {
      clearStoredAuth()
    }
    return null
  },
  setUser: (user) => localStorage.setItem(USER_KEY, JSON.stringify(user || null)),
  setSession: persistAuthSession,
  clear: () => clearStoredAuth(),
  hasUsableRefreshToken,
  needsAccessRefresh,
  refreshSession: () => refreshAuthSession()
}

let refreshPromise = null

const refreshClient = axios.create({
  baseURL: backendBaseURL,
  timeout: 120000
})

const backend = axios.create({
  baseURL: backendBaseURL,
  timeout: 120000
})

function unwrapBackendResponse(response) {
  const body = response.data
  if (body?.code === 0) return body.data
  throw body || { message: '操作失败，请稍后再试' }
}

async function refreshAuthSession() {
  if (refreshPromise) return refreshPromise

  const refreshToken = authStorage.getRefreshToken()
  if (!refreshToken || isExpiredOrInvalidToken(refreshToken)) {
    clearStoredAuth()
    return Promise.reject({ code: 40102, message: '刷新令牌已过期，请重新登录' })
  }

  refreshPromise = refreshClient
    .post('/auth/refresh', { refreshToken }, { skipAuthRefresh: true })
    .then((response) => {
      const data = unwrapBackendResponse(response)
      const nextAccessToken = data?.accessToken || data?.access_token || ''
      if (!nextAccessToken) {
        throw new Error('刷新令牌返回异常')
      }
      persistAuthSession({
        accessToken: nextAccessToken,
        refreshToken: data?.refreshToken || data?.refresh_token || refreshToken
      })
      return nextAccessToken
    })
    .catch((err) => {
      const latestRefreshToken = authStorage.getRefreshToken()
      const latestAccessToken = authStorage.getAccessToken()
      if (latestRefreshToken && latestRefreshToken !== refreshToken && latestAccessToken && !isExpiredOrInvalidToken(latestAccessToken)) {
        return latestAccessToken
      }
      clearStoredAuth()
      throw err?.response?.data || err
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

export async function ensureFreshAccessToken({ force = false } = {}) {
  if ((force || authStorage.needsAccessRefresh()) && authStorage.hasUsableRefreshToken()) {
    await refreshAuthSession()
  }

  const token = authStorage.getAccessToken()
  return token && !isExpiredOrInvalidToken(token) ? token : ''
}

function friendlyNetworkError(error) {
  if (error.code === 'ECONNABORTED') {
    return {
      code: 50401,
      message: '请求处理时间较长，请稍后在记录中查看结果',
      request_id: null
    }
  }
  if ([522, 523, 524, 525].includes(error.response?.status)) {
    return {
      code: 50401,
      message: '请求处理时间较长，正在尝试找回生成结果',
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

backend.interceptors.request.use(async (config) => {
  const skipRefresh = shouldSkipProactiveRefresh(config)

  if (!skipRefresh && authStorage.needsAccessRefresh() && authStorage.hasUsableRefreshToken()) {
    await refreshAuthSession().catch(() => null)
  }

  const storedToken = authStorage.getAccessToken()
  const token = skipRefresh
    ? (storedToken && !isExpiredOrInvalidToken(storedToken) ? storedToken : '')
    : await ensureFreshAccessToken()
  if (token) {
    config.headers = config.headers || {}
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
  async (error) => {
    const body = error.response?.data
    const originalRequest = error.config || {}

    if (error.response?.status === 401 && shouldRetryWithRefresh(originalRequest)) {
      originalRequest._authRetry = true
      try {
        const token = await refreshAuthSession()
        originalRequest.headers = originalRequest.headers || {}
        originalRequest.headers.Authorization = `Bearer ${token}`
        return backend(originalRequest)
      } catch {
        // refreshAuthSession 已负责在确认会话失效时清理本地状态。
      }
    }

  if (error.response?.status === 401 && !isPublicAuthRequest(originalRequest)) {
      authStorage.clear()
    }
    return Promise.reject(friendlyNetworkError(error) || body || { message: '操作失败，请稍后再试' })
  }
)

export default backend
