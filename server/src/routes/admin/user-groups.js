// -*- coding: utf-8 -*-
/**
 * 管理端用户组路由
 * 路径前缀：/api/admin/user-groups
 */
import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';

import { success, error, paginate } from '../../utils/response.js';
import * as UserGroupService from '../../services/user-groups.js';
import { UserGroupError } from '../../services/user-groups.js';
import { logger } from '../../utils/logger.js';

const router = Router();
const dbIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dbIdParam(name, label) {
  return param(name).matches(dbIdPattern).withMessage(`${label}格式不正确`);
}

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
  if (err instanceof UserGroupError) {
    return error(res, err.code, err.message, mapCodeToHttpStatus(err.code), Object.keys(err.extra).length ? err.extra : null);
  }
  logger.error(`用户组服务异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

function groupPayload(bodyData) {
  return {
    name: bodyData.name,
    code: bodyData.code,
    description: bodyData.description,
    isDefault: bodyData.is_default ?? bodyData.isDefault,
    costMultiplier: bodyData.cost_multiplier ?? bodyData.costMultiplier,
    dailyGenerateLimit: bodyData.daily_generate_limit ?? bodyData.dailyGenerateLimit,
    priority: bodyData.priority,
    badgeColor: bodyData.badge_color ?? bodyData.badgeColor,
    isActive: bodyData.is_active ?? bodyData.isActive
  };
}

const groupValidators = [
  body('name').optional().isLength({ min: 1, max: 50 }).withMessage('name 不能为空且不超过 50 字').trim(),
  body('code').optional().isLength({ min: 1, max: 30 }).matches(/^[a-zA-Z0-9_-]+$/).withMessage('code 仅支持字母、数字、下划线和横线'),
  body('description').optional({ nullable: true }).isLength({ max: 255 }).withMessage('description 不超过 255 字'),
  body('is_default').optional().isBoolean().withMessage('is_default 必须为布尔值').toBoolean(),
  body('cost_multiplier').optional().isDecimal({ decimal_digits: '0,3' }).withMessage('cost_multiplier 格式不正确'),
  body('daily_generate_limit').optional().isInt({ min: 0 }).withMessage('daily_generate_limit 需为非负整数').toInt(),
  body('priority').optional().isInt({ min: 0 }).withMessage('priority 需为非负整数').toInt(),
  body('badge_color').optional({ nullable: true }).isLength({ max: 20 }).withMessage('badge_color 不超过 20 字'),
  body('is_active').optional().isBoolean().withMessage('is_active 必须为布尔值').toBoolean()
];

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('页码需为正整数').toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页条数需为 1-100').toInt(),
    query('keyword').optional().isString().trim(),
    query('is_active').optional().isBoolean().withMessage('is_active 必须为布尔值').toBoolean()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await UserGroupService.listGroups({
        page: req.query.page,
        pageSize: req.query.pageSize,
        keyword: req.query.keyword,
        isActive: req.query.is_active
      });
      return paginate(res, result);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.get('/options', async (req, res) => {
  try {
    const result = await UserGroupService.listAllActiveGroups();
    return success(res, result, '获取用户组选项成功');
  } catch (err) {
    return handleServiceError(res, err);
  }
});

router.post(
  '/',
  [
    body('name').isLength({ min: 1, max: 50 }).withMessage('name 不能为空且不超过 50 字').trim(),
    body('code').isLength({ min: 1, max: 30 }).matches(/^[a-zA-Z0-9_-]+$/).withMessage('code 仅支持字母、数字、下划线和横线'),
    ...groupValidators
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await UserGroupService.createGroup(groupPayload(req.body));
      return success(res, result, '用户组创建成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.put(
  '/:id',
  [dbIdParam('id', '用户组 ID '), ...groupValidators],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await UserGroupService.updateGroup(req.params.id, groupPayload(req.body));
      return success(res, result, '用户组更新成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.delete(
  '/:id',
  [dbIdParam('id', '用户组 ID ')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await UserGroupService.deleteGroup(req.params.id);
      return success(res, result, '用户组已删除');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
