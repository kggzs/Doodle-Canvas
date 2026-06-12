/**
 * Image API | 图片生成 API
 */

import { request } from '@/utils'
import { getProviderConfig } from '@/config/providers'

/**
 * 创建异步任务(阿里云万相)
 * @param {Object} data - 请求数据
 * @param {Object} options - 选项
 * @returns {Promise}
 */
const createAsyncTask = async (data, options = {}) => {
  const { provider = 'aliyun', model } = options
  const config = getProviderConfig(provider)
  
  // 根据模型版本选择不同的端点
  let endpoint = config.endpoints.imageAsync // wan2.6异步
  if (model && !model.includes('wan2.6')) {
    endpoint = config.endpoints.imageLegacy // wan2.5及以下版本
  }
  
  // 创建任务
  const response = await request({
    url: endpoint,
    method: 'post',
    data,
    headers: {
      'X-DashScope-Async': 'enable' // 必须添加此头部
    }
  })
  
  return response
}

/**
 * 查询异步任务状态(阿里云万相)
 * @param {string} taskId - 任务ID
 * @param {Object} options - 选项
 * @returns {Promise}
 */
const queryAsyncTask = async (taskId, options = {}) => {
  const { provider = 'aliyun' } = options
  const config = getProviderConfig(provider)
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
  const { maxRetries = 30, interval = 3000 } = options
  
  for (let i = 0; i < maxRetries; i++) {
    const response = await queryAsyncTask(taskId, options)
    
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
  
  // 阿里云万相特殊处理:使用 provider 配置中的端点,不走默认拼接逻辑
  if (provider === 'aliyun') {
    const config = getProviderConfig(provider)
    
    // wan2.6 使用同步调用
    if (model && model.includes('wan2.6')) {
      const syncEndpoint = config.endpoints.image
      
      return request({
        url: syncEndpoint,
        method: 'post',
        data
      })
    }
    
    // wan2.5及以下版本必须使用异步调用
    const taskResponse = await createAsyncTask(data, { provider, model })
    
    if (!taskResponse.output?.task_id) {
      throw new Error('创建任务失败')
    }
    
    // 等待任务完成
    const result = await waitAsyncTask(taskResponse.output.task_id, { provider })
    
    return result
  }
  
  // 其他渠道使用标准接口
  return request({
    url: endpoint,
    method: 'post',
    data,
    headers: requestType === 'formdata' ? { 'Content-Type': 'multipart/form-data' } : {}
  })
}
