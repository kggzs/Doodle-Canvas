// -*- coding: utf-8 -*-
/**
 * 统一响应封装
 * 所有业务 API（非 SSE 流）统一返回以下结构：
 * { code, message, data, request_id }
 * - code: 0 表示成功，非 0 见错误码表
 * - message: 人类可读提示
 * - data: 业务数据，失败时为 null
 * - request_id: 链路追踪 ID（从 res.locals.requestId 获取）
 */
import { recordResponseError } from '../services/error-logs.js';

/**
 * 获取当前请求的 request_id
 * @param {Object} res Express 响应对象
 * @returns {string|null} request_id
 */
function getRequestId(res) {
  return res.locals?.requestId || null;
}

function isAdminRequest(res) {
  return Boolean(res?.req?.originalUrl?.startsWith('/api/admin'));
}

function publicErrorMessage(httpStatus, code) {
  if (httpStatus === 401) return '请先登录或重新登录';
  if (httpStatus === 403) return '当前账号无权执行此操作';
  if (httpStatus === 404) return '请求的内容不存在';
  if (httpStatus === 402 || (code >= 40201 && code <= 40299)) return '积分不足，请充值后再试';
  if (httpStatus === 422) return '提交内容不完整或格式不正确';
  if (httpStatus === 429) return '请求过于频繁，请稍后再试';
  if (httpStatus >= 500) return '服务暂时不可用，请稍后再试';
  return '操作失败，请稍后再试';
}

/**
 * 成功响应
 * @param {Object} res Express 响应对象
 * @param {*} data 业务数据
 * @param {string} [message='ok'] 提示消息
 * @param {number} [code=0] 业务码，0 表示成功
 * @returns {Object} Express 响应
 */
export function success(res, data, message = 'ok', code = 0) {
  return res.json({
    code,
    message,
    data,
    request_id: getRequestId(res)
  });
}

/**
 * 错误响应
 * @param {Object} res Express 响应对象
 * @param {number} code 业务错误码（如 40101、42201）
 * @param {string} message 错误消息
 * @param {number} [httpStatus=400] HTTP 状态码
 * @param {Array|null} [errors=null] 字段级错误详情（422 类校验失败时使用）
 * @returns {Object} Express 响应
 */
export function error(res, code, message, httpStatus = 400, errors = null) {
  const adminRequest = isAdminRequest(res);
  const responseMessage = adminRequest ? message : publicErrorMessage(httpStatus, code);

  recordResponseError(res, {
    code,
    message,
    httpStatus,
    publicMessage: responseMessage,
    details: errors
  });

  const body = {
    code,
    message: responseMessage,
    data: null,
    request_id: getRequestId(res)
  };
  if (errors && adminRequest) {
    body.errors = errors;
  }
  return res.status(httpStatus).json(body);
}

/**
 * 分页响应
 * @param {Object} res Express 响应对象
 * @param {Object} params 分页参数
 * @param {Array} params.items 当前页数据
 * @param {number} params.total 总记录数
 * @param {number} params.page 当前页码（从 1 开始）
 * @param {number} params.pageSize 每页条数
 * @returns {Object} Express 响应
 */
export function paginate(res, { items, total, page, pageSize }) {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return res.json({
    code: 0,
    message: 'ok',
    data: {
      items,
      total,
      page,
      page_size: pageSize,
      total_pages: totalPages
    },
    request_id: getRequestId(res)
  });
}

export default { success, error, paginate };
