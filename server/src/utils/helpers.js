// -*- coding: utf-8 -*-
/**
 * 通用工具函数集合
 * 提供项目内常用的辅助方法
 */
import dayjs from 'dayjs';

/**
 * 格式化日期时间（默认 YYYY-MM-DD HH:mm:ss）
 * @param {Date|string|number} date 日期
 * @param {string} [format='YYYY-MM-DD HH:mm:ss'] 格式
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!date) return '';
  return dayjs(date).format(format);
}

/**
 * 获取当前时间戳（秒）
 * @returns {number} 当前 Unix 时间戳（秒）
 */
export function now() {
  return Math.floor(Date.now() / 1000);
}

/**
 * 安全解析 JSON 字符串
 * @param {string} str JSON 字符串
 * @param {*} [defaultValue=null] 解析失败时的默认值
 * @returns {*} 解析结果或默认值
 */
export function safeJsonParse(str, defaultValue = null) {
  if (!str) return defaultValue;
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
}

/**
 * 判断值是否为空（null/undefined/空字符串/空数组/空对象）
 * @param {*} value 待判断的值
 * @returns {boolean} 是否为空
 */
export function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * 对象深拷贝（基于 JSON，适用于纯数据对象）
 * @param {*} obj 待拷贝的对象
 * @returns {*} 拷贝后的对象
 */
export function deepClone(obj) {
  if (obj === null || obj === undefined) return obj;
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 延迟指定毫秒
 * @param {number} ms 毫秒数
 * @returns {Promise<void>} Promise
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 生成指定范围的随机整数
 * @param {number} min 最小值（含）
 * @param {number} max 最大值（含）
 * @returns {number} 随机整数
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 过滤对象中的空值字段（null/undefined/空字符串）
 * @param {Object} obj 原始对象
 * @returns {Object} 过滤后的对象
 */
export function omitEmpty(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!isEmpty(value)) {
      result[key] = value;
    }
  }
  return result;
}

export default {
  formatDate,
  now,
  safeJsonParse,
  isEmpty,
  deepClone,
  sleep,
  randomInt,
  omitEmpty
};
