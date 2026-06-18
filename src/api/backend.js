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
  adminChannelApi,
  adminModelApi
}
