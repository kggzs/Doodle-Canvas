/**
 * Video API | 视频生成 API
 * 只调用后端代理，渠道与 API Key 由管理端配置。
 */

import backend from '@/utils/backend'

/**
 * 创建视频任务
 * @param {Object} data - 原始生成参数
 */
export const createVideoTask = (data) => backend.post('/generate/video', data, { timeout: 0 })

/**
 * 查询视频任务状态
 * @param {string} taskId - 任务 ID
 */
export const getVideoTaskStatus = (taskId) => backend.get(`/generate/video/${encodeURIComponent(taskId)}`)

/**
 * 轮询视频任务直到完成
 * @param {string} taskId - 任务 ID
 * @param {number} maxAttempts - 最大尝试次数
 * @param {number} interval - 轮询间隔（毫秒）
 */
export const pollVideoTask = async (taskId, maxAttempts = 120, interval = 5000) => {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await getVideoTaskStatus(taskId)

    if (result.status === 'completed' && result.url) {
      return result
    }

    if (result.status === 'failed' || result.status === 'error') {
      throw new Error(result.error || '视频生成失败')
    }

    await new Promise(resolve => setTimeout(resolve, interval))
  }

  throw new Error('视频生成超时')
}
