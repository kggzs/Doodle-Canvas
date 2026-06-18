// -*- coding: utf-8 -*-
/**
 * 管理端文件路由
 * 路径前缀：/api/admin/files
 */
import { Router } from 'express';
import { param, query, validationResult } from 'express-validator';

import { error, paginate, success } from '../../utils/response.js';
import * as StorageService from '../../services/storage.js';
import { StorageError } from '../../services/storage.js';
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
  if (err instanceof StorageError || Number.isInteger(err.code)) {
    const status = err.code >= 40401 && err.code <= 40499 ? 404 : err.code >= 40901 && err.code <= 40999 ? 409 : 400;
    return error(res, err.code, err.message, status, Object.keys(err.extra || {}).length ? err.extra : null);
  }
  logger.error(`管理文件接口异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('页码需为正整数').toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页条数需为 1-100').toInt(),
    query('user_id').optional().isUUID().withMessage('user_id 格式不正确'),
    query('status').optional().isIn(['active', 'deleted', 'quarantined']).withMessage('status 不支持'),
    query('type').optional().isIn(['upload', 'generated_image', 'generated_video', 'thumbnail']).withMessage('type 不支持'),
    query('keyword').optional().isString().trim()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await StorageService.listFiles({
        page: req.query.page,
        pageSize: req.query.pageSize,
        userId: req.query.user_id,
        status: req.query.status,
        type: req.query.type,
        keyword: req.query.keyword
      });
      return paginate(res, result);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.post(
  '/:id/restore',
  [param('id').isUUID().withMessage('文件 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const file = await StorageService.restoreFile(req.params.id);
      return success(res, { file }, '文件已恢复');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
