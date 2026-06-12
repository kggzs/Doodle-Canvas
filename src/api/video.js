/**
 * Video API | 视频生成 API
 */

import { request } from '@/utils'

/**
 * 创建视频任务
 * @param {Object} data - 请求数据
 * @param {Object} options - 选项
 * @param {string} options.endpoint - 端点路径
 * @param {string} options.requestType - 请求类型 'json' 或 'formdata'
 * @param {string} options.provider - 渠道标识（用于判断是否添加异步头）
 * @param {string} options.model - 模型名称
 */
export const createVideoTask = (data, options = {}) => {
  const { endpoint = '/videos', requestType = 'json', provider, model } = options
  const headers = requestType === 'formdata'
    ? { 'Content-Type': 'multipart/form-data' }
    : { 'Content-Type': 'application/json' }

  // 阿里云万相视频API需要异步头
  if (provider === 'aliyun') {
    headers['X-DashScope-Async'] = 'enable'
  }

  return request({
    url: endpoint,
    method: 'post',
    data,
    headers
  })
}

/**
 * 查询视频任务状态
 * @param {string} taskId - 任务ID
 * @param {Object} options - 选项
 * @param {string} options.endpoint - 端点路径
 */
export const getVideoTaskStatus = (taskId, options = {}) => {
  const { endpoint = '/videos' } = options
  return request({
    url: endpoint,
    method: 'get'
  })
}

/**
 * 轮询视频任务直到完成
 * @param {string} taskId - 任务ID
 * @param {number} maxAttempts - 最大尝试次数
 * @param {number} interval - 轮询间隔（毫秒）
 */
export const pollVideoTask = async (taskId, maxAttempts = 120, interval = 5000) => {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await getVideoTaskStatus(taskId)

    if (result.status === 'completed' || result.data) {
      return result
    }

    if (result.status === 'failed') {
      throw new Error(result.error?.message || '视频生成失败')
    }

    await new Promise(resolve => setTimeout(resolve, interval))
  }

  throw new Error('视频生成超时')
}
