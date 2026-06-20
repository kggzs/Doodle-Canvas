// -*- coding: utf-8 -*-
/**
 * 用户侧生成记录路由
 * 路径前缀：/api/records
 */
import { Router } from 'express';
import { param, query, validationResult } from 'express-validator';

import { authMiddleware } from '../middleware/auth.js';
import { error, paginate, success } from '../utils/response.js';
import * as RecordService from '../services/records.js';
import { RecordError } from '../services/records.js';
import { logger } from '../utils/logger.js';

const router = Router();

function validateRequest(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, 42201, '参数校验失败', 422, errors.array());
  }
  return undefined;
}

function handleServiceError(res, err) {
  if (err instanceof RecordError || Number.isInteger(err.code)) {
    const status = err.code >= 40401 && err.code <= 40499 ? 404 : 400;
    return error(res, err.code, err.message, status, Object.keys(err.extra || {}).length ? err.extra : null);
  }
  logger.error(`生成记录接口异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

router.use(authMiddleware);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('页码需为正整数').toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页条数需为 1-100').toInt(),
    query('type').optional().isIn(['image', 'video', 'chat']).withMessage('type 不支持'),
    query('status').optional().isIn(['pending', 'processing', 'completed', 'failed', 'cancelled']).withMessage('status 不支持'),
    query('review_status').optional().isIn(['pending', 'pass', 'review', 'reject', 'hidden']).withMessage('review_status 不支持'),
    query('client_request_id').optional().isLength({ min: 1, max: 100 }).withMessage('client_request_id 格式不正确').trim(),
    query('keyword').optional().isString().trim()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await RecordService.listUserRecords(req.userId, {
        page: req.query.page,
        pageSize: req.query.pageSize,
        type: req.query.type,
        status: req.query.status,
        reviewStatus: req.query.review_status,
        clientRequestId: req.query.client_request_id,
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
  [param('id').isUUID().withMessage('记录 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const record = await RecordService.getUserRecord(req.userId, req.params.id);
      return success(res, { record }, '获取生成记录成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
