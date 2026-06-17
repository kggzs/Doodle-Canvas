// -*- coding: utf-8 -*-
/**
 * 用户侧模型列表路由
 * 路径前缀：/api/models
 * - 仅返回已启用、且存在至少一个可用渠道绑定的模型
 * - 不暴露渠道 API Key 或上游地址
 */
import { Router } from 'express';
import { param, validationResult } from 'express-validator';

import { success, error } from '../utils/response.js';
import * as ModelManagementService from '../services/model-management.js';
import { ModelManagementError } from '../services/model-management.js';
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
  if (code >= 40401 && code <= 40499) return 404;
  if (code >= 42201 && code <= 42299) return 422;
  if (code >= 50001 && code <= 50099) return 500;
  return 400;
}

function handleServiceError(res, err) {
  if (err instanceof ModelManagementError) {
    return error(res, err.code, err.message, mapCodeToHttpStatus(err.code), Object.keys(err.extra).length ? err.extra : null);
  }
  logger.error(`用户侧模型接口异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

router.get('/', async (req, res) => {
  try {
    const result = await ModelManagementService.listPublicModels();
    return success(res, result, '获取模型列表成功');
  } catch (err) {
    return handleServiceError(res, err);
  }
});

router.get(
  '/:type(image|video|chat)',
  [param('type').isIn(['image', 'video', 'chat']).withMessage('模型类型不支持')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.listPublicModels(req.params.type);
      return success(res, result, '获取模型列表成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.get(
  '/:idOrKey',
  [param('idOrKey').isLength({ min: 1, max: 100 }).withMessage('模型 ID 或标识格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.getPublicModel(req.params.idOrKey);
      return success(res, result, '获取模型详情成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
