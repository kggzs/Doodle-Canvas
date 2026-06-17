/**
 * Image API | 图片生成 API
 * 只调用后端代理，渠道与 API Key 由管理端配置。
 */

import backend from '@/utils/backend'

/**
 * 生成图片
 * @param {Object} data - 原始生成参数
 * @returns {Promise<Object>} 后端归一化后的生成结果
 */
export const generateImage = (data) => backend.post('/generate/image', data)
