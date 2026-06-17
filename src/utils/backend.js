/**
 * Backend API client | 后端业务接口请求客户端
 * 用于调用同源 /api 业务接口，不接触第三方 AI Key / Base URL。
 */
import axios from 'axios'

const TOKEN_KEY = 'doodle-access-token'
const REFRESH_TOKEN_KEY = 'doodle-refresh-token'
const USER_KEY = 'doodle-current-user'

export const authStorage = {
  getAccessToken: () => localStorage.getItem(TOKEN_KEY) || '',
  setAccessToken: (token) => localStorage.setItem(TOKEN_KEY, token || ''),
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY) || '',
  setRefreshToken: (token) => localStorage.setItem(REFRESH_TOKEN_KEY, token || ''),
  getUser: () => {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },
  setUser: (user) => localStorage.setItem(USER_KEY, JSON.stringify(user || null)),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }
}

const backend = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_BASE_URL || '/api',
  timeout: 30000
})

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
    return Promise.reject(body || error)
  }
)

export default backend
