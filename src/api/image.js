/**
 * Image API | 图片生成 API
 */

import { request } from '@/utils'
import { getProviderConfig } from '@/config/providers'

/**
 * 创建异步任务(阿里云万相)
 * @param {Object} data - 请求数据
 * @returns {Promise}
 */
const createAsyncTask = async (data) => {
  const config = getProviderConfig('aliyun')
  const endpoint = config.endpoints.imageAsync

  const response = await request({
    url: endpoint,
    method: 'post',
    data,
    headers: {
      'X-DashScope-Async': 'enable'
    }
  })

  return response
}

/**
 * 查询异步任务状态(阿里云万相)
 * @param {string} taskId - 任务ID
 * @returns {Promise}
 */
const queryAsyncTask = async (taskId) => {
  const config = getProviderConfig('aliyun')
  const endpoint = config.endpoints.imageQuery.replace('{taskId}', taskId)

  const response = await request({
    url: endpoint,
    method: 'get'
  })

  return response
}

/**
 * 等待异步任务完成(阿里云万相)
 * @param {string} taskId - 任务ID
 * @param {Object} options - 选项
 * @returns {Promise}
 */
const waitAsyncTask = async (taskId, options = {}) => {
  const { maxRetries = 60, interval = 3000 } = options

  for (let i = 0; i < maxRetries; i++) {
    const response = await queryAsyncTask(taskId)

    if (response.output?.task_status === 'SUCCEEDED') {
      return response
    }

    if (response.output?.task_status === 'FAILED') {
      throw new Error(response.message || '任务执行失败')
    }

    // 等待一段时间后继续查询
    await new Promise(resolve => setTimeout(resolve, interval))
  }

  throw new Error('任务超时')
}

/**
 * 生成图片(统一接口)
 * @param {Object} data - 请求数据(已适配)
 * @param {Object} options - 选项
 * @returns {Promise}
 */
export const generateImage = async (data, options = {}) => {
  const { requestType = 'json', endpoint = '/images/generations', provider, model } = options

  // 判断是否为阿里云万相(双重检查:通过provider或model名称)
  const isAliyun = provider === 'aliyun' || (model && model.startsWith('wan'))

  // 调试日志
  if (import.meta.env.DEV) {
    console.log(`[generateImage] provider=${provider}, model=${model}, isAliyun=${isAliyun}`)
  }

  // 阿里云万相:直接使用同步调用(阿里云会自动处理超时降级)
  if (isAliyun) {
    const config = getProviderConfig('aliyun')
    const syncEndpoint = config.endpoints.image

    return await request({
      url: syncEndpoint,
      method: 'post',
      data,
      timeout: 180000 // 同步调用可能耗时较长,设置3分钟超时
    })
  }

  // 其他渠道使用标准接口
  // 安全检查:如果URL指向阿里云,强制走代理
  let requestUrl = endpoint
  if (requestUrl.includes('dashscope')) {
    const config = getProviderConfig('aliyun')
    requestUrl = config.endpoints.image
  }

  return request({
    url: requestUrl,
    method: 'post',
    data,
    headers: requestType === 'formdata' ? { 'Content-Type': 'multipart/form-data' } : {}
  })
}
