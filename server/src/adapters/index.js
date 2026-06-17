// -*- coding: utf-8 -*-
/**
 * 请求适配器注册表
 * 按 provider_type 分发到具体适配器实现
 * 后续 Task 将实现：
 * - openai.js   标准 OpenAI 格式（chat/image/video）
 * - aliyun.js   阿里云万相格式
 * - doubao.js   豆包 Responses API 格式
 * - custom.js   自定义格式
 */

/**
 * 适配器注册表
 * key 为 provider_type，value 为适配器对象
 */
const adapters = new Map();

/**
 * 注册适配器
 * @param {string} providerType 提供商类型
 * @param {Object} adapter 适配器对象
 */
export function registerAdapter(providerType, adapter) {
  adapters.set(providerType, adapter);
}

/**
 * 获取适配器
 * @param {string} providerType 提供商类型
 * @returns {Object|null} 适配器对象
 */
export function getAdapter(providerType) {
  return adapters.get(providerType) || null;
}

/**
 * 列出所有已注册的适配器类型
 * @returns {string[]} 适配器类型列表
 */
export function listAdapters() {
  return Array.from(adapters.keys());
}

export default { registerAdapter, getAdapter, listAdapters };
