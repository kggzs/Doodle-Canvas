/**
 * API Store | API 状态存储
 * 
 * 请使用 useModelStore (stores/pinia) 替代此文件。
 * 参考: const modelStore = useModelStore()
 *       modelStore.getServiceConfig('chat')
 *       modelStore.isServiceConfigured('image')
 */

import { useModelStore } from '@/stores/pinia'

// 保持向后兼容的 API
export const useApiConfig = () => {
  const store = useModelStore()
  const chatCfg = store.getServiceConfig('chat')
  return {
    apiKey: chatCfg.apiKey,
    baseUrl: chatCfg.baseUrl,
    isConfigured: !!chatCfg.apiKey,
    setApiKey: (key) => store.setServiceApiKey('chat', key),
    setBaseUrl: (url) => store.setServiceBaseUrl('chat', url),
    configure: (config) => {
      if (config.apiKey) store.setServiceApiKey('chat', config.apiKey)
      if (config.baseUrl) store.setServiceBaseUrl('chat', config.baseUrl)
    },
    clear: () => store.clearServiceConfig('chat')
  }
}
