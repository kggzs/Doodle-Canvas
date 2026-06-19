// -*- coding: utf-8 -*-
/**
 * 管理端模型配置路由
 * 路径前缀：/api/admin/models
 */
import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';

import { success, error, paginate } from '../../utils/response.js';
import * as ModelManagementService from '../../services/model-management.js';
import { ModelManagementError } from '../../services/model-management.js';
import { logger } from '../../utils/logger.js';

const router = Router();

const modelTypes = ['image', 'video', 'chat'];
const rotationStrategies = ['round_robin', 'weighted_random', 'priority', 'failover'];

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
  logger.error(`模型管理服务异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

function modelPayload(body) {
  return {
    modelKey: body.model_key ?? body.modelKey,
    displayName: body.display_name ?? body.displayName,
    modelType: body.model_type ?? body.modelType,
    isActive: body.is_active ?? body.isActive,
    defaultParams: body.default_params ?? body.defaultParams,
    maxParams: body.max_params ?? body.maxParams,
    sortOrder: body.sort_order ?? body.sortOrder,
    description: body.description,
    channelId: body.channel_id ?? body.channelId,
    rotationWeight: body.rotation_weight ?? body.rotationWeight,
    rotationStrategy: body.rotation_strategy ?? body.rotationStrategy
  };
}

function bindingPayload(body) {
  return {
    channelId: body.channel_id ?? body.channelId,
    rotationWeight: body.rotation_weight ?? body.rotationWeight,
    rotationStrategy: body.rotation_strategy ?? body.rotationStrategy,
    isActive: body.is_active ?? body.isActive,
    lastUsedIndex: body.last_used_index ?? body.lastUsedIndex
  };
}

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('页码需为正整数').toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页条数需为 1-100').toInt(),
    query('type').optional().isIn(modelTypes).withMessage('type 不支持'),
    query('is_active').optional().isBoolean().withMessage('is_active 必须为布尔值').toBoolean(),
    query('keyword').optional().isString().trim()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.listModelConfigs({
        page: req.query.page,
        pageSize: req.query.pageSize,
        modelType: req.query.type,
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
    body('model_key').isLength({ min: 1, max: 100 }).withMessage('model_key 不能为空且不超过 100 字').trim(),
    body('display_name').isLength({ min: 1, max: 100 }).withMessage('display_name 不能为空且不超过 100 字').trim(),
    body('model_type').isIn(modelTypes).withMessage('model_type 不支持'),
    body('is_active').optional().isBoolean().withMessage('is_active 必须为布尔值').toBoolean(),
    body('default_params').optional({ nullable: true }).isObject().withMessage('default_params 必须为对象'),
    body('max_params').optional({ nullable: true }).isObject().withMessage('max_params 必须为对象'),
    body('sort_order').optional().isInt({ min: 0 }).withMessage('sort_order 需为非负整数').toInt(),
    body('description').optional({ nullable: true }).isString().withMessage('description 必须为字符串'),
    body('channel_id').optional({ nullable: true }).isUUID().withMessage('channel_id 格式不正确'),
    body('rotation_weight').optional().isInt({ min: 1, max: 10 }).withMessage('rotation_weight 需为 1-10').toInt(),
    body('rotation_strategy').optional().isIn(rotationStrategies).withMessage('rotation_strategy 不支持')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.createModelConfig(modelPayload(req.body));
      return success(res, result, '模型创建成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.put(
  '/:id/status',
  [
    param('id').isUUID().withMessage('模型 ID 格式不正确'),
    body('is_active').isBoolean().withMessage('is_active 必须为布尔值').toBoolean()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.setModelStatus(req.params.id, req.body.is_active);
      return success(res, result, '模型状态已更新');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.get(
  '/:id/channels',
  [param('id').isUUID().withMessage('模型 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.listModelBindings(req.params.id);
      return success(res, { items: result, total: result.length }, '获取模型绑定渠道成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.post(
  '/:id/channels',
  [
    param('id').isUUID().withMessage('模型 ID 格式不正确'),
    body('channel_id').isUUID().withMessage('channel_id 格式不正确'),
    body('rotation_weight').optional().isInt({ min: 1, max: 10 }).withMessage('rotation_weight 需为 1-10').toInt(),
    body('rotation_strategy').optional().isIn(rotationStrategies).withMessage('rotation_strategy 不支持'),
    body('is_active').optional().isBoolean().withMessage('is_active 必须为布尔值').toBoolean()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.addModelBinding(req.params.id, bindingPayload(req.body));
      return success(res, result, '模型渠道绑定成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.put(
  '/:id/channels/:bindingId',
  [
    param('id').isUUID().withMessage('模型 ID 格式不正确'),
    param('bindingId').isUUID().withMessage('绑定 ID 格式不正确'),
    body('rotation_weight').optional().isInt({ min: 1, max: 10 }).withMessage('rotation_weight 需为 1-10').toInt(),
    body('rotation_strategy').optional().isIn(rotationStrategies).withMessage('rotation_strategy 不支持'),
    body('is_active').optional().isBoolean().withMessage('is_active 必须为布尔值').toBoolean(),
    body('last_used_index').optional().isInt({ min: 0 }).withMessage('last_used_index 需为非负整数').toInt()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.updateModelBinding(req.params.id, req.params.bindingId, bindingPayload(req.body));
      return success(res, result, '模型渠道绑定已更新');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.delete(
  '/:id/channels/:bindingId',
  [
    param('id').isUUID().withMessage('模型 ID 格式不正确'),
    param('bindingId').isUUID().withMessage('绑定 ID 格式不正确')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.removeModelBinding(req.params.id, req.params.bindingId);
      return success(res, result, '模型渠道绑定已移除');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.get(
  '/:id',
  [param('id').isUUID().withMessage('模型 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.getModelConfig(req.params.id);
      return success(res, result, '获取模型详情成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.put(
  '/:id',
  [
    param('id').isUUID().withMessage('模型 ID 格式不正确'),
    body('model_key').optional().isLength({ min: 1, max: 100 }).withMessage('model_key 不能为空且不超过 100 字').trim(),
    body('display_name').optional().isLength({ min: 1, max: 100 }).withMessage('display_name 不能为空且不超过 100 字').trim(),
    body('model_type').optional().isIn(modelTypes).withMessage('model_type 不支持'),
    body('is_active').optional().isBoolean().withMessage('is_active 必须为布尔值').toBoolean(),
    body('default_params').optional({ nullable: true }).isObject().withMessage('default_params 必须为对象'),
    body('max_params').optional({ nullable: true }).isObject().withMessage('max_params 必须为对象'),
    body('sort_order').optional().isInt({ min: 0 }).withMessage('sort_order 需为非负整数').toInt(),
    body('description').optional({ nullable: true }).isString().withMessage('description 必须为字符串')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.updateModelConfig(req.params.id, modelPayload(req.body));
      return success(res, result, '模型更新成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.delete(
  '/:id',
  [param('id').isUUID().withMessage('模型 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ModelManagementService.deleteModelConfig(req.params.id);
      return success(res, result, '模型已删除');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
