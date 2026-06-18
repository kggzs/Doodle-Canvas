// -*- coding: utf-8 -*-
/**
 * 管理端金币路由
 * 路径前缀：/api/admin/coins
 */
import { Router } from 'express';
import { query, validationResult } from 'express-validator';

import { error, paginate } from '../../utils/response.js';
import * as CoinService from '../../services/coins.js';
import { CoinError } from '../../services/coins.js';
import { logger } from '../../utils/logger.js';

const router = Router();
const txTypes = ['recharge', 'gift', 'consume', 'refund', 'adjust', 'freeze', 'unfreeze', 'expire'];
const directions = ['in', 'out'];

function validateRequest(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, 42201, '参数校验失败', 422, errors.array());
  }
  return undefined;
}

function mapCodeToHttpStatus(code) {
  if (code >= 40401 && code <= 40499) return 404;
  if (code >= 40901 && code <= 40999) return 409;
  if (code >= 42201 && code <= 42299) return 422;
  return 400;
}

function handleServiceError(res, err) {
  if (err instanceof CoinError) {
    return error(res, err.code, err.message, mapCodeToHttpStatus(err.code), Object.keys(err.extra).length ? err.extra : null);
  }
  logger.error(`金币服务异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

router.get(
  '/transactions',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('页码需为正整数').toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页条数需为 1-100').toInt(),
    query('user_id').optional().isUUID().withMessage('user_id 格式不正确'),
    query('type').optional().isIn(txTypes).withMessage('type 不支持'),
    query('direction').optional().isIn(directions).withMessage('direction 不支持'),
    query('keyword').optional().isString().trim()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await CoinService.listTransactions({
        page: req.query.page,
        pageSize: req.query.pageSize,
        userId: req.query.user_id,
        type: req.query.type,
        direction: req.query.direction,
        keyword: req.query.keyword
      });
      return paginate(res, result);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
