// -*- coding: utf-8 -*-
/**
 * 审计上下文中间件
 * 统一采集 IP / UA / 地理位置，注入 req.auditContext
 * 供后续 AuditService / LoginLog 等使用
 *
 * 采集字段：
 * - ip：客户端真实 IP
 * - userAgent：原始 UA 字符串
 * - uaBrowser：浏览器名称与版本
 * - uaOs：操作系统
 * - uaDevice：设备类型
 * - uaIsBot：是否为爬虫/机器人
 * - requestId：请求追踪 ID（来自 requestId 中间件）
 * - location：IP 地理位置（可选，未接入库时为 null）
 */
import { extractIpAndUa, parseIpLocation } from '../utils/ip-ua.js';

/**
 * 审计上下文中间件
 * 采集 IP / UA / 地理位置，注入 req.auditContext
 * @param {Object} req Express 请求对象
 * @param {Object} res Express 响应对象
 * @param {Function} next 下一个中间件
 */
export function auditContextMiddleware(req, res, next) {
  const { ip, ua, parsedUa } = extractIpAndUa(req);

  // 解析 IP 地理位置（未接入库时返回 null，不阻断流程）
  const location = parseIpLocation(ip);

  // 注入审计上下文，供后续 Service 层使用
  req.auditContext = {
    ip,
    userAgent: ua,
    uaBrowser: parsedUa.browser,
    uaOs: parsedUa.os,
    uaDevice: parsedUa.device,
    uaIsBot: parsedUa.isBot,
    requestId: req.requestId || res.locals.requestId || null,
    location
  };

  next();
}

export default auditContextMiddleware;
