// -*- coding: utf-8 -*-
/**
 * 管理端计费规则路由
 * 路径前缀：/api/admin/billing
 */
import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';

import { error, paginate, success } from '../../utils/response.js';
import * as BillingService from '../../services/billing.js';
import { BillingError } from '../../services/billing.js';
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
  if (err instanceof BillingError || Number.isInteger(err.code)) {
    const status = err.code >= 40401 && err.code <= 40499 ? 404 : 400;
    return error(res, err.code, err.message, status, Object.keys(err.extra || {}).length ? err.extra : null);
  }
  logger.error(`管理计费接口异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

router.get(
  '/rules',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('页码需为正整数').toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页条数需为 1-100').toInt(),
    query('model_id').optional().isUUID().withMessage('model_id 格式不正确')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await BillingService.listRules({
        page: req.query.page,
        pageSize: req.query.pageSize,
        modelId: req.query.model_id
      });
      return paginate(res, result);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.post(
  '/rules',
  [
    body('model_id').isLength({ min: 1, max: 100 }).withMessage('model_id 不能为空'),
    body('rule_type').optional().isIn(['fixed']).withMessage('rule_type 仅支持 fixed'),
    body('fixed_amount').optional().isFloat({ min: 0 }).withMessage('fixed_amount 不能小于 0'),
    body('is_active').optional().isBoolean().withMessage('is_active 必须为布尔值').toBoolean()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const rule = await BillingService.upsertRule(req.body);
      return success(res, { rule }, '计费规则已保存');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.put(
  '/rules/:id',
  [
    param('id').isUUID().withMessage('规则 ID 格式不正确'),
    body('rule_type').optional().isIn(['fixed']).withMessage('rule_type 仅支持 fixed'),
    body('fixed_amount').optional().isFloat({ min: 0 }).withMessage('fixed_amount 不能小于 0'),
    body('is_active').optional().isBoolean().withMessage('is_active 必须为布尔值').toBoolean()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const rule = await BillingService.updateRule(req.params.id, req.body);
      return success(res, { rule }, '计费规则已更新');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.delete(
  '/rules/:id',
  [param('id').isUUID().withMessage('规则 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await BillingService.deleteRule(req.params.id);
      return success(res, result, '计费规则已删除');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
