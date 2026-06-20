// -*- coding: utf-8 -*-
/**
 * 管理端渠道地址池路由
 * 路径前缀：/api/admin/channels
 */
import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';

import { success, error, paginate } from '../../utils/response.js';
import * as ModelManagementService from '../../services/model-management.js';
import { ModelManagementError } from '../../services/model-management.js';
import { logger } from '../../utils/logger.js';

const router = Router();

const providerTypes = ['openai', 'aliyun', 'doubao', 'stepfun', 'agnes', 'custom'];
const modelTypes = ['image', 'video', 'chat'];

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
  if (code >= 50001 && code <= 50099) return 500;
  return 400;
}

function handleServiceError(res, err) {
  if (err instanceof ModelManagementError) {
    const details = err.extra && Object.keys(err.extra).length ? err.extra : null;
    return error(res, err.code, err.message, mapCodeToHttpStatus(err.code), details);
  }
  logger.error(`渠道管理服务异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

function channelPayload(body) {
  return {
    name: body.name,
    providerType: body.provider_type ?? body.providerType,
    modelType: body.model_type ?? body.modelType,
    apiBaseUrl: body.api_base_url ?? body.apiBaseUrl,
    apiKey: body.api_key ?? body.apiKey,
    isActive: body.is_active ?? body.isActive,
    priority: body.priority,
    weight: body.weight,
    maxConcurrent: body.max_concurrent ?? body.maxConcurrent,
    timeoutMs: body.timeout_ms ?? body.timeoutMs,
    config: body.config
  };
}

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('页码需为正整数').toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页条数需为 1-100').toInt(),
    query('provider_type').optional().isIn(providerTypes).withMessage('provider_type 不支持'),
    query('model_type').optional().isIn(modelTypes).withMessage('model_type 不支持'),
    query('type').optional().isIn(modelTypes).withMessage('type 不支持'),
    query('is_active').optional().isBoolean().withMessage('is_active 必须为布尔值').toBoolean(),
    query('keyword').optional().isString().trim()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.listChannels({
        page: req.query.page,
        pageSize: req.query.pageSize,
        providerType: req.query.provider_type,
        modelType: req.query.model_type || req.query.type,
        isActive: req.query.is_active,
        keyword: req.query.keyword
      });
      return paginate(res, result);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.post(
  '/',
  [
    body('name').isLength({ min: 1, max: 100 }).withMessage('渠道名称不能为空且不超过 100 字').trim(),
    body('provider_type').isIn(providerTypes).withMessage('provider_type 不支持'),
    body('model_type').isIn(modelTypes).withMessage('model_type 不支持'),
    body('api_base_url').isLength({ min: 1, max: 500 }).withMessage('api_base_url 不能为空且不超过 500 字').trim(),
    body('api_key').isLength({ min: 1 }).withMessage('api_key 不能为空'),
    body('is_active').optional().isBoolean().withMessage('is_active 必须为布尔值').toBoolean(),
    body('priority').optional().isInt({ min: 0 }).withMessage('priority 需为非负整数').toInt(),
    body('weight').optional().isInt({ min: 1, max: 100 }).withMessage('weight 需为 1-100').toInt(),
    body('max_concurrent').optional().isInt({ min: 1, max: 1000 }).withMessage('max_concurrent 需为正整数').toInt(),
    body('timeout_ms').optional().isInt({ min: 1000, max: 600000 }).withMessage('timeout_ms 需在 1000-600000 之间').toInt(),
    body('config').optional({ nullable: true }).isObject().withMessage('config 必须为对象')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.createChannel(channelPayload(req.body));
      return success(res, result, '渠道创建成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.put(
  '/:id',
  [
    param('id').isUUID().withMessage('渠道 ID 格式不正确'),
    body('name').optional().isLength({ min: 1, max: 100 }).withMessage('渠道名称不能为空且不超过 100 字').trim(),
    body('provider_type').optional().isIn(providerTypes).withMessage('provider_type 不支持'),
    body('model_type').optional().isIn(modelTypes).withMessage('model_type 不支持'),
    body('api_base_url').optional().isLength({ min: 1, max: 500 }).withMessage('api_base_url 不能为空且不超过 500 字').trim(),
    body('api_key').optional().isLength({ min: 1 }).withMessage('api_key 不能为空'),
    body('is_active').optional().isBoolean().withMessage('is_active 必须为布尔值').toBoolean(),
    body('priority').optional().isInt({ min: 0 }).withMessage('priority 需为非负整数').toInt(),
    body('weight').optional().isInt({ min: 1, max: 100 }).withMessage('weight 需为 1-100').toInt(),
    body('max_concurrent').optional().isInt({ min: 1, max: 1000 }).withMessage('max_concurrent 需为正整数').toInt(),
    body('timeout_ms').optional().isInt({ min: 1000, max: 600000 }).withMessage('timeout_ms 需在 1000-600000 之间').toInt(),
    body('config').optional({ nullable: true }).isObject().withMessage('config 必须为对象')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.updateChannel(req.params.id, channelPayload(req.body));
      return success(res, result, '渠道更新成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.delete(
  '/:id',
  [param('id').isUUID().withMessage('渠道 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.deleteChannel(req.params.id);
      return success(res, result, '渠道已删除');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.post(
  '/:id/test',
  [param('id').isUUID().withMessage('渠道 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.testChannel(req.params.id);
      return success(res, result, '渠道测试完成');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.post(
  '/:id/reset-circuit',
  [param('id').isUUID().withMessage('渠道 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.resetChannelCircuit(req.params.id);
      return success(res, result, '熔断器已重置');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.get(
  '/:id/stats',
  [param('id').isUUID().withMessage('渠道 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.getChannelStats(req.params.id);
      return success(res, result, '获取渠道统计成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
