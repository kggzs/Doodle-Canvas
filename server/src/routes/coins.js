// -*- coding: utf-8 -*-
/**
 * 用户侧金币路由
 * 路径前缀：/api/coins
 */
import { Router } from 'express';
import { query, validationResult } from 'express-validator';

import { authMiddleware } from '../middleware/auth.js';
import { error, paginate, success } from '../utils/response.js';
import * as CoinService from '../services/coins.js';
import { CoinError } from '../services/coins.js';
import { logger } from '../utils/logger.js';

const router = Router();
const txTypes = [
  'recharge',
  'recharge_bonus',
  'redeem',
  'gift',
  'register_gift',
  'consume',
  'refund',
  'adjust_add',
  'adjust_deduct',
  'freeze',
  'unfreeze',
  'forfeit',
  'expire',
  'transfer_in',
  'transfer_out',
  'rollback'
];

function validateRequest(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, 42201, '参数校验失败', 422, errors.array());
  }
  return undefined;
}

function mapCodeToHttpStatus(code) {
  if (code >= 40101 && code <= 40199) return 401;
  if (code >= 40201 && code <= 40299) return 402;
  if (code >= 40401 && code <= 40499) return 404;
  if (code >= 40901 && code <= 40999) return 409;
  if (code >= 42201 && code <= 42299) return 422;
  return 400;
}

function handleServiceError(res, err) {
  if (err instanceof CoinError || Number.isInteger(err.code)) {
    return error(res, err.code, err.message, mapCodeToHttpStatus(err.code), Object.keys(err.extra || {}).length ? err.extra : null);
  }
  logger.error(`用户金币接口异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

router.use(authMiddleware);

router.get('/balance', async (req, res) => {
  try {
    const balance = await CoinService.getBalance(req.userId);
    return success(res, { balance }, '获取余额成功');
  } catch (err) {
    return handleServiceError(res, err);
  }
});

router.get('/summary', async (req, res) => {
  try {
    const result = await CoinService.getSummary(req.userId);
    return success(res, result, '获取金币汇总成功');
  } catch (err) {
    return handleServiceError(res, err);
  }
});

router.get(
  '/transactions',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('页码需为正整数').toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页条数需为 1-100').toInt(),
    query('type').optional().isIn(txTypes).withMessage('type 不支持'),
    query('direction').optional().isIn(['in', 'out']).withMessage('direction 不支持')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await CoinService.listTransactions({
        page: req.query.page,
        pageSize: req.query.pageSize,
        userId: req.userId,
        type: req.query.type,
        direction: req.query.direction
      });
      return paginate(res, result);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
