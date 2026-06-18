// -*- coding: utf-8 -*-
/**
 * 用户侧计费路由
 * 路径前缀：/api/billing
 */
import { Router } from 'express';
import { query, validationResult } from 'express-validator';

import { authMiddleware } from '../middleware/auth.js';
import { error, success } from '../utils/response.js';
import * as BillingService from '../services/billing.js';
import { BillingError } from '../services/billing.js';
import { logger } from '../utils/logger.js';

const router = Router();

function validateRequest(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, 42201, '参数校验失败', 422, errors.array());
  }
  return undefined;
}

function mapCodeToHttpStatus(code) {
  if (code >= 40201 && code <= 40299) return 402;
  if (code >= 40401 && code <= 40499) return 404;
  if (code >= 42201 && code <= 42299) return 422;
  return 400;
}

function handleServiceError(res, err) {
  if (err instanceof BillingError || Number.isInteger(err.code)) {
    return error(res, err.code, err.message, mapCodeToHttpStatus(err.code), Object.keys(err.extra || {}).length ? err.extra : null);
  }
  logger.error(`计费接口异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

router.use(authMiddleware);

router.get(
  '/estimate',
  [
    query('model').isLength({ min: 1, max: 100 }).withMessage('model 不能为空且不超过 100 字').trim(),
    query('type').optional().isIn(['image', 'video', 'chat']).withMessage('type 不支持')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const payload = { ...req.query };
      delete payload.model;
      delete payload.type;
      const estimate = await BillingService.estimateCost({
        userId: req.userId,
        modelId: req.query.model,
        modelType: req.query.type,
        payload
      });
      return success(res, {
        model: {
          id: estimate.model.id,
          model_key: estimate.model.modelKey,
          display_name: estimate.model.displayName,
          model_type: estimate.model.modelType
        },
        base_amount: estimate.baseAmount,
        final_cost: estimate.finalCost,
        group: estimate.group
          ? {
              id: estimate.group.id,
              code: estimate.group.code,
              name: estimate.group.name,
              cost_multiplier: Number(estimate.group.costMultiplier || 1)
            }
          : null,
        breakdown: estimate.costBreakdown
      }, '费用预估成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
