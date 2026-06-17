/**
 * Backend business APIs | 后端业务 API
 */
import backend from '@/utils/backend'

export const adminUserApi = {
  list: (params) => backend.get('/admin/users', { params }),
  detail: (id) => backend.get(`/admin/users/${id}`),
  update: (id, data) => backend.put(`/admin/users/${id}`, data),
  setStatus: (id, status) => backend.put(`/admin/users/${id}/status`, { status }),
  ban: (id, data) => backend.post(`/admin/users/${id}/ban`, data),
  unban: (id) => backend.post(`/admin/users/${id}/unban`),
  loginLogs: (id, params) => backend.get(`/admin/users/${id}/login-logs`, { params }),
  remove: (id) => backend.delete(`/admin/users/${id}`)
}

export default {
  adminUserApi
}
