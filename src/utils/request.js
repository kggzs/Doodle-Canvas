/**
 * HTTP Request Utility | HTTP 请求工具
 * Axios-based request with interceptors
 */

import axios from 'axios'
import { getDefaultBaseUrl } from '@/config/providers'

// Base URL from environment or default
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.openai.com'

// Create axios instance | 创建 axios 实例
const instance = axios.create({
  baseURL: "/",
  timeout: 300000 // 5 分钟
})

// Request interceptor | 请求拦截器
instance.interceptors.request.use(
  (config) => {
    // 安全解析 JSON localStorage 项
    const parseStored = (key, fallback) => {
      try {
        const v = localStorage.getItem(key)
        return v ? JSON.parse(v) : fallback
      } catch {
        return fallback
      }
    }

    // Get current provider | 获取当前渠道(全局默认)
    const globalProvider = localStorage.getItem('api-provider') || 'openai'

    // Get service type from custom header | 从自定义头获取服务类型
    // 'chat' | 'image' | 'video' | ''(未知, 回退全局)
    const serviceType = config.headers?.['X-Service-Type'] || ''

    // 提取后移除自定义头,防止上游服务器拒绝未知请求头
    delete config.headers['X-Service-Type']

    // 解析本次请求的 provider: 服务独立 provider 优先, 否则全局
    const serviceProviders = parseStored('service-providers', {})
    const provider = (serviceType && serviceProviders[serviceType]) || globalProvider

    // Get API keys | 获取 API Keys
    const apiKeysByProvider = parseStored('api-keys-by-provider', {})
    const serviceApiKeys = parseStored('service-api-keys', {})
    // 优先级: 服务独立 key > 全局 provider key
    const apiKey = (serviceType && serviceApiKeys[serviceType]) || apiKeysByProvider[provider] || ''

    // Get Base URL | 获取 Base URL
    const baseUrlsByProvider = parseStored('base-urls-by-provider', {})
    const serviceBaseUrls = parseStored('service-base-urls', {})
    // 优先级: 服务独立 baseUrl > 全局 provider baseUrl > default baseUrl(兜底)
    const baseUrl = (serviceType && serviceBaseUrls[serviceType])
      || baseUrlsByProvider[provider]
      || getDefaultBaseUrl(provider)
      || ''

    // Set base URL for this request | 为此请求设置 Base URL
    // 阿里云万相:强制走Vite代理,忽略保存的baseUrl
    if (provider === 'aliyun') {
      config.baseURL = '/'
    } else if (baseUrl) {
      // 非阿里云渠道:走 /proxy 动态代理,避免浏览器直连第三方域名导致 CORS 问题
      const cleanBaseUrl = baseUrl.replace(/\/$/, '')
      config.baseURL = '/'

      // url 可能是相对路径（/v1/images/generations）或完整 URL（https://xxx/v1/images/generations）
      // 统一提取路径和 query 部分
      let urlPath, urlSearch
      const originalUrl = config.url || ''

      try {
        // 尝试解析为完整 URL
        const parsed = new URL(originalUrl)
        urlPath = parsed.pathname
        urlSearch = parsed.search.replace(/^\?/, '')
      } catch {
        // 不是完整 URL，按相对路径处理
        const [path, search] = originalUrl.split('?')
        urlPath = path
        urlSearch = search || ''
      }

      const searchSuffix = urlSearch ? `&${urlSearch}` : ''
      config.url = `/proxy${urlPath}?_target=${encodeURIComponent(cleanBaseUrl)}${searchSuffix}`
    }

    // Skip auth for certain endpoints | 跳过某些端点的认证
    const noAuthEndpoints = ['/model/page', '/model/fullName', '/model/types']
    const isNoAuth = noAuthEndpoints.some(ep => config.url?.includes(ep))

    if (apiKey && !isNoAuth) {
      config.headers['Authorization'] = `Bearer ${apiKey}`
    }

    // 调试日志(开发环境)
    if (import.meta.env.DEV) {
      console.log(`[Request] service=${serviceType || '-'}, provider=${provider}, url=${config.url}, baseURL=${config.baseURL}, hasApiKey=${!!apiKey}`)
    }

    return config
  },
  (error) => {
    console.error('Request error:', error)
    return Promise.reject(error)
  }
)

// Response interceptor | 响应拦截器
instance.interceptors.response.use(
  (res) => {
    const { data, code, message } = res.data || {}
    
    // Handle stream response | 处理流响应
    if (res.config.responseType === 'stream') {
      return res.data
    }
    
    // Handle blob response | 处理 blob 响应
    if (res.data instanceof Blob) {
      return res.data
    }
    
    // Success response | 成功响应
    if (code === 200 || res.status === 200) {
      return res.data
    }
    
    // Error response | 错误响应
    window.$message?.error(message || 'Request failed')
    return Promise.reject(res.data)
  },
  (error) => {
    const { response } = error
    
    if (response) {
      const { status, data } = response
      // 优先显示阿里云等API返回的详细错误信息
      const message = data?.message || data?.error?.message || data?.code || error.message
      
      // 调试日志:输出完整错误响应
      if (import.meta.env.DEV) {
        console.error(`[Response Error] status=${status}, url=${response.config?.url}, data=`, data)
      }
      
      if (status === 401) {
        window.$message?.error('API Key 无效或已过期')
      } else if (status === 403) {
        window.$message?.error(`访问被拒绝: ${message}`)
      } else if (status === 429) {
        window.$message?.error('请求过于频繁，请稍后再试')
      } else {
        window.$message?.error(message || '请求失败')
      }
    } else {
      window.$message?.error(error.message || '网络错误')
    }
    
    return Promise.reject(error)
  }
)

/**
 * Set API base URL | 设置 API 基础 URL
 * @param {string} url - Base URL
 */
export const setBaseUrl = (url) => {
  instance.defaults.baseURL = url
}

/**
 * Get current base URL | 获取当前基础 URL
 * @returns {string}
 */
export const getBaseUrl = () => {
  return instance.defaults.baseURL
}

export default instance
