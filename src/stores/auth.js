/**
 * Auth store | 认证状态
 */
import { computed, ref } from 'vue'
import backend, { authStorage } from '@/utils/backend'

export const currentUser = ref(authStorage.getUser())
export const accessToken = ref(authStorage.getAccessToken())
export const refreshToken = ref(authStorage.getRefreshToken())
export const isLoggedIn = computed(() => !!accessToken.value && !!currentUser.value)
export const isAdmin = computed(() => currentUser.value?.role === 'admin')

window.addEventListener('doodle-auth-cleared', () => {
  accessToken.value = ''
  refreshToken.value = ''
  currentUser.value = null
})

export function setAuthSession(session = {}) {
  const nextAccessToken = session.accessToken || session.access_token || ''
  const nextRefreshToken = session.refreshToken || session.refresh_token || ''
  const user = session.user || null

  authStorage.setAccessToken(nextAccessToken)
  authStorage.setRefreshToken(nextRefreshToken)
  authStorage.setUser(user)
  accessToken.value = nextAccessToken
  refreshToken.value = nextRefreshToken
  currentUser.value = user
}

export function clearAuthSession() {
  authStorage.clear()
  accessToken.value = ''
  refreshToken.value = ''
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

export async function checkEmail(email) {
  return backend.post('/auth/check-email', { email })
}

export async function resendVerification(email) {
  return backend.post('/auth/resend-verification', { email })
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
  const currentRefreshToken = refreshToken.value || authStorage.getRefreshToken()
  try {
    await backend.post('/auth/logout', { refreshToken: currentRefreshToken })
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
  checkEmail,
  resendVerification,
  verifyEmail,
  fetchProfile,
  logout,
  clearAuthSession
}
