// -*- coding: utf-8 -*-
/**
 * IP 与 User-Agent 解析工具
 * - IP 解析：从 Express 请求对象提取真实 IP（支持代理转发）
 * - UA 解析：基于 ua-parser-js 解析浏览器、操作系统、设备信息
 * - 地理位置解析：parseIpLocation 预留接口，后续接入 ip2region / MaxMind
 */
import UAParser from 'ua-parser-js';

// 常见爬虫/机器人 UA 关键词正则（不区分大小写，词边界匹配避免误判）
const BOT_REGEX = /\b(googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|sogou|exabot|facebot|ia_archiver|facebookexternalhit|twitterbot|linkedinbot|telegrambot|discordbot|applebot|petalbot|bytespider|crawler|spider|bot)\b/i;

/**
 * 从 Express 请求对象提取客户端真实 IP
 * 优先级：X-Forwarded-For 首个 > X-Real-IP > req.ip > req.connection.remoteAddress
 * @param {Object} req Express 请求对象
 * @returns {string} 客户端 IP 地址
 */
export function getClientIp(req) {
  // X-Forwarded-For 可能包含多个 IP，取第一个（最原始的客户端 IP）
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = forwarded.split(',')[0].trim();
    if (ip) return ip;
  }
  // X-Real-IP（Nginx 代理设置）
  const realIp = req.headers['x-real-ip'];
  if (realIp) return realIp.trim();
  // Express 内置 IP
  if (req.ip) return req.ip;
  // 兜底：从 connection 读取
  const remoteAddress = req.connection?.remoteAddress || req.socket?.remoteAddress;
  if (remoteAddress) {
    // IPv6 映射的 IPv4 地址（::ffff:127.0.0.1）转换为 IPv4
    if (remoteAddress.startsWith('::ffff:')) {
      return remoteAddress.slice(7);
    }
    return remoteAddress;
  }
  return 'unknown';
}

/**
 * 解析 User-Agent 字符串
 * @param {string} ua User-Agent 字符串
 * @returns {Object} 解析结果，包含 browser/os/device/isBot/raw 字段
 */
export function parseUserAgent(ua) {
  if (!ua) {
    return {
      browser: 'unknown',
      os: 'unknown',
      device: 'unknown',
      isBot: false,
      raw: ''
    };
  }
  const parser = new UAParser(ua);
  const result = parser.getResult();
  return {
    browser: result.browser?.name ? `${result.browser.name} ${result.browser.version || ''}`.trim() : 'unknown',
    os: result.os?.name ? `${result.os.name} ${result.os.version || ''}`.trim() : 'unknown',
    device: result.device?.type || 'desktop',
    isBot: BOT_REGEX.test(ua),
    raw: ua
  };
}

/**
 * 从 Express 请求对象提取 User-Agent
 * @param {Object} req Express 请求对象
 * @returns {string} User-Agent 字符串
 */
export function getUserAgent(req) {
  return req.headers['user-agent'] || '';
}

/**
 * 从 Express 请求对象一次性提取 IP 与 UA 解析结果
 * @param {Object} req Express 请求对象
 * @returns {{ip: string, ua: string, parsedUa: Object}} IP 与 UA 信息
 */
export function extractIpAndUa(req) {
  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  const parsedUa = parseUserAgent(ua);
  return { ip, ua, parsedUa };
}

/**
 * 解析 IP 地理位置（预留接口）
 * 后续接入 ip2region / MaxMind GeoIP2 库后返回 country/region/city/isp
 * 当前返回 null，调用方需做空值判断
 * @param {string} ip IP 地址
 * @returns {{country: string, region: string, city: string, isp: string}|null} 地理位置信息，未接入库时返回 null
 */
export function parseIpLocation(ip) {
  // 内网/未知 IP 直接跳过
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') {
    return null;
  }
  // TODO: 后续 Task 接入 ip2region / MaxMind 本地库或远程 API
  // 示例实现：
  // const result = ip2region.search(ip);
  // return { country: result.country, region: result.province, city: result.city, isp: result.isp };
  return null;
}

export default { getClientIp, parseUserAgent, getUserAgent, extractIpAndUa, parseIpLocation };
