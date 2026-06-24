// -*- coding: utf-8 -*-
/**
 * 错误日志服务
 * - 记录 API 错误响应和未捕获异常
 * - 提供管理端分页查询
 */
import { Op } from 'sequelize';

import db from '../models/index.js';
import { logger } from '../utils/logger.js';

const { ErrorLog } = db;

let ensurePromise = null;

async function ensureTable() {
  if (!ensurePromise) {
    ensurePromise = ErrorLog.sync().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

function compactDetails(details) {
  if (!details) return null;
  if (Array.isArray(details)) return details.slice(0, 20);
  if (typeof details === 'object') {
    const safe = { ...details };
    delete safe.authorization;
    delete safe.Authorization;
    delete safe.api_key;
    delete safe.apiKey;
    delete safe.password;
    delete safe.token;
    return safe;
  }
  return { value: String(details).slice(0, 2000) };
}

export async function recordError(data = {}) {
  try {
    await ensureTable();
    return ErrorLog.create({
      requestId: data.requestId || null,
      level: data.level || 'error',
      scope: data.scope || null,
      code: data.code ?? null,
      httpStatus: data.httpStatus ?? null,
      method: data.method || null,
      path: data.path || null,
      userId: data.userId || null,
      clientIp: data.clientIp || null,
      userAgent: data.userAgent || null,
      message: String(data.message || '未知错误').slice(0, 10000),
      publicMessage: data.publicMessage || null,
      stack: data.stack ? String(data.stack).slice(0, 30000) : null,
      details: compactDetails(data.details),
      isResolved: false
    });
  } catch (err) {
    logger.warn(`错误日志写入失败：${err.message}`);
    return null;
  }
}

export function recordResponseError(res, { code, message, httpStatus, publicMessage, details }) {
  const req = res?.req;
  if (!req || !req.originalUrl?.startsWith('/api')) return;
  recordError({
    requestId: res.locals?.requestId || null,
    level: httpStatus >= 500 ? 'error' : 'warn',
    scope: req.originalUrl.startsWith('/api/admin') ? 'admin_api' : 'user_api',
    code,
    httpStatus,
    method: req.method,
    path: req.originalUrl,
    userId: req.userId || req.user?.id || null,
    clientIp: req.auditContext?.ip || req.ip || null,
    userAgent: req.auditContext?.userAgent || req.get?.('user-agent') || null,
    message,
    publicMessage,
    details
  });
}

export async function listLogs(params = {}) {
  await ensureTable();
  const pageSize = Math.min(Math.max(parseInt(params.pageSize, 10) || 20, 1), 100);
  const page = Math.max(parseInt(params.page, 10) || 1, 1);
  const where = {};

  if (params.level) where.level = params.level;
  if (params.scope) where.scope = params.scope;
  if (params.code) where.code = Number(params.code);
  if (params.httpStatus) where.httpStatus = Number(params.httpStatus);
  if (params.userId) where.userId = params.userId;
  if (params.keyword) {
    where[Op.or] = [
      { requestId: { [Op.like]: `%${params.keyword}%` } },
      { path: { [Op.like]: `%${params.keyword}%` } },
      { message: { [Op.like]: `%${params.keyword}%` } },
      { publicMessage: { [Op.like]: `%${params.keyword}%` } }
    ];
  }

  const { rows, count } = await ErrorLog.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize
  });

  return { items: rows, total: count, page, pageSize };
}

export async function getLog(id) {
  await ensureTable();
  return ErrorLog.findByPk(id);
}

export async function markResolved(id) {
  await ensureTable();
  const log = await ErrorLog.findByPk(id);
  if (!log) return null;
  await log.update({ isResolved: true, resolvedAt: new Date() });
  return log;
}

export async function deleteLog(id) {
  await ensureTable();
  const log = await ErrorLog.findByPk(id);
  if (!log) return null;
  await log.destroy();
  return { id };
}

export default {
  recordError,
  recordResponseError,
  listLogs,
  getLog,
  markResolved,
  deleteLog
};
