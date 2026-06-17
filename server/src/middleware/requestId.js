// -*- coding: utf-8 -*-
/**
 * request_id 中间件
 * 生成或复用请求追踪 ID，贯穿 access_logs / audit_logs / coin_transactions 等表
 * - 有入站头 X-Request-Id → 复用（限 50 字符、仅 [a-zA-Z0-9_-]）
 * - 无入站头 → 生成 req_ + 22 位 nanoid
 * - 注入 req.requestId 与 res.locals.requestId
 * - 设置响应头 X-Request-Id
 */
import { nanoid } from 'nanoid';
import { logger } from '../utils/logger.js';

// 合法的 request_id 正则：前缀 req_ + 字母数字下划线短横线，总长 ≤ 50
const VALID_REQUEST_ID_REGEX = /^req_[a-zA-Z0-9_-]{1,46}$/;

/**
 * 生成新的 request_id
 * @returns {string} 格式为 req_xxxxxxxx 的 request_id
 */
function generateRequestId() {
  return `req_${nanoid(22)}`;
}

/**
 * 校验入站 request_id 是否合法
 * @param {string} id 待校验的 request_id
 * @returns {boolean} 是否合法
 */
function isValidRequestId(id) {
  if (!id || typeof id !== 'string') return false;
  if (id.length > 50) return false;
  return VALID_REQUEST_ID_REGEX.test(id);
}

/**
 * request_id 中间件
 * @param {Object} req Express 请求对象
 * @param {Object} res Express 响应对象
 * @param {Function} next 下一个中间件
 */
export function requestIdMiddleware(req, res, next) {
  // 优先复用入站头
  const inboundId = req.headers['x-request-id'];
  const requestId = isValidRequestId(inboundId) ? inboundId : generateRequestId();

  // 注入到 req 与 res.locals，供后续 logger / service 使用
  req.requestId = requestId;
  res.locals.requestId = requestId;

  // 设置响应头
  res.setHeader('X-Request-Id', requestId);

  // 记录请求开始（debug 级别）
  logger.debug(`请求开始 ${req.method} ${req.originalUrl}`, { request_id: requestId });

  next();
}

export default requestIdMiddleware;
