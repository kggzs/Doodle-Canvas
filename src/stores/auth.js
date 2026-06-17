/**
 * Auth store | 认证状态
 */
import { computed, ref } from 'vue'
import backend, { authStorage } from '@/utils/backend'

export const currentUser = ref(authStorage.getUser())
export const isLoggedIn = computed(() => !!authStorage.getAccessToken() && !!currentUser.value)
export const isAdmin = computed(() => currentUser.value?.role === 'admin')

export function setAuthSession({ accessToken, refreshToken, user }) {
  authStorage.setAccessToken(accessToken)
  authStorage.setRefreshToken(refreshToken)
  authStorage.setUser(user)
  currentUser.value = user || null
}

export function clearAuthSession() {
  authStorage.clear()
  currentUser.value = null
}

export async function login(emailOrUsername, password) {
  const data = await backend.post('/auth/login', { emailOrUsername, password })
  setAuthSession(data)
  return data
}

export async function register({ email, username, password }) {
  return backend.post('/auth/register', { email, username, password })
}

export async function verifyEmail({ email, code }) {
  const data = await backend.post('/auth/verify-email', { email, code })
  setAuthSession(data)
  return data
}

export async function fetchProfile() {
  const user = await backend.get('/auth/me')
  currentUser.value = user
  authStorage.setUser(user)
  return user
}

export async function logout() {
  const refreshToken = authStorage.getRefreshToken()
  try {
    await backend.post('/auth/logout', { refreshToken })
  } catch {
    // 本地退出优先，不阻塞用户操作
  }
  clearAuthSession()
}

export default {
  currentUser,
  isLoggedIn,
  isAdmin,
  login,
  register,
  verifyEmail,
  fetchProfile,
  logout,
  clearAuthSession
}
