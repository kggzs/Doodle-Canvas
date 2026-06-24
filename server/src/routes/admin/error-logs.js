// -*- coding: utf-8 -*-
/**
 * 管理端错误日志路由
 * 路径前缀：/api/admin/error-logs
 */
import { Router } from 'express';
import { param, query, validationResult } from 'express-validator';

import { error, paginate, success } from '../../utils/response.js';
import * as ErrorLogService from '../../services/error-logs.js';
import { logger } from '../../utils/logger.js';

const router = Router();

function validateRequest(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, 42201, '参数校验失败', 422, errors.array());
  }
  return undefined;
}

function handleServiceError(res, err) {
  logger.error(`管理错误日志接口异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('页码需为正整数').toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页条数需为 1-100').toInt(),
    query('level').optional().isIn(['error', 'warn', 'info']).withMessage('level 不支持'),
    query('scope').optional().isString().trim(),
    query('code').optional().isInt().withMessage('code 需为整数').toInt(),
    query('http_status').optional().isInt({ min: 100, max: 599 }).withMessage('http_status 不正确').toInt(),
    query('user_id').optional().isUUID().withMessage('user_id 格式不正确'),
    query('keyword').optional().isString().trim()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ErrorLogService.listLogs({
        page: req.query.page,
        pageSize: req.query.pageSize,
        level: req.query.level,
        scope: req.query.scope,
        code: req.query.code,
        httpStatus: req.query.http_status,
        userId: req.query.user_id,
        keyword: req.query.keyword
      });
      return paginate(res, result);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.get(
  '/:id',
  [param('id').isUUID().withMessage('日志 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const log = await ErrorLogService.getLog(req.params.id);
      if (!log) return error(res, 40402, '错误日志不存在', 404);
      return success(res, { log }, '获取错误日志成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.post(
  '/:id/resolve',
  [param('id').isUUID().withMessage('日志 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const log = await ErrorLogService.markResolved(req.params.id);
      if (!log) return error(res, 40402, '错误日志不存在', 404);
      return success(res, { log }, '错误日志已标记处理');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.delete(
  '/:id',
  [param('id').isUUID().withMessage('日志 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ErrorLogService.deleteLog(req.params.id);
      if (!result) return error(res, 40402, '错误日志不存在', 404);
      return success(res, result, '错误日志已删除');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
