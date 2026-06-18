// -*- coding: utf-8 -*-
/**
 * 用户侧项目路由
 * 路径前缀：/api/projects
 */
import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';

import { authMiddleware } from '../middleware/auth.js';
import { error, paginate, success } from '../utils/response.js';
import * as ProjectService from '../services/project.js';
import { ProjectError } from '../services/project.js';
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
  if (err instanceof ProjectError || Number.isInteger(err.code)) {
    const status = err.code >= 40401 && err.code <= 40499 ? 404 : 400;
    return error(res, err.code, err.message, status, Object.keys(err.extra || {}).length ? err.extra : null);
  }
  logger.error(`项目接口异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

router.use(authMiddleware);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('页码需为正整数').toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页条数需为 1-100').toInt()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ProjectService.listProjects(req.userId, req.query);
      return paginate(res, result);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.post(
  '/',
  [
    body('name').isLength({ min: 1, max: 200 }).withMessage('项目名称不能为空且不能超过 200 字'),
    body('description').optional({ nullable: true }).isString(),
    body('canvas_data').optional({ nullable: true }).isObject().withMessage('canvas_data 必须为对象'),
    body('thumbnail_file_id').optional({ nullable: true }).isUUID().withMessage('thumbnail_file_id 格式不正确')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const project = await ProjectService.createProject(req.userId, req.body);
      return success(res, { project }, '项目创建成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.get(
  '/:id',
  [param('id').isUUID().withMessage('项目 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const project = await ProjectService.getProject(req.userId, req.params.id);
      return success(res, { project }, '获取项目成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.put(
  '/:id',
  [
    param('id').isUUID().withMessage('项目 ID 格式不正确'),
    body('name').optional().isLength({ min: 1, max: 200 }).withMessage('项目名称不能超过 200 字'),
    body('description').optional({ nullable: true }).isString(),
    body('canvas_data').optional({ nullable: true }).isObject().withMessage('canvas_data 必须为对象'),
    body('thumbnail_file_id').optional({ nullable: true }).isUUID().withMessage('thumbnail_file_id 格式不正确')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const project = await ProjectService.updateProject(req.userId, req.params.id, req.body);
      return success(res, { project }, '项目更新成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.delete(
  '/:id',
  [param('id').isUUID().withMessage('项目 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await ProjectService.deleteProject(req.userId, req.params.id);
      return success(res, result, '项目已删除');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
