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
  groups: (id) => backend.get(`/admin/users/${id}/groups`),
  projects: (id, params) => backend.get(`/admin/users/${id}/projects`, { params }),
  coins: (id, params) => backend.get(`/admin/users/${id}/coins`, { params }),
  changePassword: (id, data) => backend.put(`/admin/users/${id}/password`, data),
  addGroup: (id, data) => backend.post(`/admin/users/${id}/groups`, data),
  removeGroup: (id, groupId) => backend.delete(`/admin/users/${id}/groups/${groupId}`),
  recharge: (id, data) => backend.post(`/admin/users/${id}/recharge`, data),
  gift: (id, data) => backend.post(`/admin/users/${id}/gift`, data),
  adjustCoins: (id, data) => backend.post(`/admin/users/${id}/adjust-coins`, data),
  remove: (id) => backend.delete(`/admin/users/${id}`)
}

export const adminUserGroupApi = {
  list: (params) => backend.get('/admin/user-groups', { params }),
  options: () => backend.get('/admin/user-groups/options'),
  create: (data) => backend.post('/admin/user-groups', data),
  update: (id, data) => backend.put(`/admin/user-groups/${id}`, data),
  remove: (id) => backend.delete(`/admin/user-groups/${id}`)
}

export const adminCoinApi = {
  transactions: (params) => backend.get('/admin/coins/transactions', { params })
}

export const coinApi = {
  balance: () => backend.get('/coins/balance'),
  summary: () => backend.get('/coins/summary'),
  transactions: (params) => backend.get('/coins/transactions', { params })
}

export const projectApi = {
  list: (params) => backend.get('/projects', { params }),
  create: (data) => backend.post('/projects', data),
  detail: (id) => backend.get(`/projects/${id}`),
  update: (id, data) => backend.put(`/projects/${id}`, data),
  remove: (id) => backend.delete(`/projects/${id}`)
}

export const recordApi = {
  list: (params) => backend.get('/records', { params }),
  detail: (id) => backend.get(`/records/${id}`)
}

export const fileApi = {
  uploadImage: (file, options = {}) => {
    const formData = new FormData()
    formData.append('file', file)
    return backend.post('/upload/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: options.onUploadProgress
    })
  },
  uploadVideo: (file, options = {}) => {
    const formData = new FormData()
    formData.append('file', file)
    return backend.post('/upload/video', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: options.onUploadProgress
    })
  }
}

export const adminDashboardApi = {
  overview: () => backend.get('/admin/dashboard/overview'),
  trend: () => backend.get('/admin/dashboard/trend'),
  modelStats: () => backend.get('/admin/dashboard/model-stats')
}

export const adminRecordApi = {
  list: (params) => backend.get('/admin/records', { params }),
  detail: (id) => backend.get(`/admin/records/${id}`)
}

export const adminBillingApi = {
  rules: (params) => backend.get('/admin/billing/rules', { params }),
  createRule: (data) => backend.post('/admin/billing/rules', data),
  updateRule: (id, data) => backend.put(`/admin/billing/rules/${id}`, data),
  removeRule: (id) => backend.delete(`/admin/billing/rules/${id}`)
}

export const billingApi = {
  pricing: () => backend.get('/billing/pricing'),
  estimate: (params) => backend.get('/billing/estimate', { params })
}

export const announcementApi = {
  latest: (params) => backend.get('/announcements/latest', { params }),
  detail: (id) => backend.get(`/announcements/${id}`)
}

export const adminAnnouncementApi = {
  list: (params) => backend.get('/admin/announcements', { params }),
  create: (data) => backend.post('/admin/announcements', data),
  update: (id, data) => backend.put(`/admin/announcements/${id}`, data),
  remove: (id) => backend.delete(`/admin/announcements/${id}`)
}

export const adminFileApi = {
  list: (params) => backend.get('/admin/files', { params }),
  restore: (id) => backend.post(`/admin/files/${id}/restore`)
}

export const adminErrorLogApi = {
  list: (params) => backend.get('/admin/error-logs', { params }),
  detail: (id) => backend.get(`/admin/error-logs/${id}`),
  resolve: (id) => backend.post(`/admin/error-logs/${id}/resolve`),
  remove: (id) => backend.delete(`/admin/error-logs/${id}`)
}

export const adminChannelApi = {
  list: (params) => backend.get('/admin/channels', { params }),
  create: (data) => backend.post('/admin/channels', data),
  update: (id, data) => backend.put(`/admin/channels/${id}`, data),
  remove: (id) => backend.delete(`/admin/channels/${id}`),
  test: (id) => backend.post(`/admin/channels/${id}/test`),
  resetCircuit: (id) => backend.post(`/admin/channels/${id}/reset-circuit`),
  stats: (id) => backend.get(`/admin/channels/${id}/stats`)
}

export const adminModelApi = {
  list: (params) => backend.get('/admin/models', { params }),
  create: (data) => backend.post('/admin/models', data),
  detail: (id) => backend.get(`/admin/models/${id}`),
  update: (id, data) => backend.put(`/admin/models/${id}`, data),
  setStatus: (id, isActive) => backend.put(`/admin/models/${id}/status`, { is_active: isActive }),
  remove: (id) => backend.delete(`/admin/models/${id}`),
  bindings: (id) => backend.get(`/admin/models/${id}/channels`),
  addBinding: (id, data) => backend.post(`/admin/models/${id}/channels`, data),
  updateBinding: (id, bindingId, data) => backend.put(`/admin/models/${id}/channels/${bindingId}`, data),
  removeBinding: (id, bindingId) => backend.delete(`/admin/models/${id}/channels/${bindingId}`)
}

export default {
  adminUserApi,
  adminUserGroupApi,
  adminCoinApi,
  adminDashboardApi,
  adminRecordApi,
  adminBillingApi,
  billingApi,
  announcementApi,
  adminAnnouncementApi,
  adminFileApi,
  adminErrorLogApi,
  adminChannelApi,
  adminModelApi,
  coinApi,
  fileApi,
  recordApi,
  projectApi
}
