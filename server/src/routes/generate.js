// -*- coding: utf-8 -*-
/**
 * 用户侧生成路由
 * 路径前缀：/api/generate
 */
import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';

import { authMiddleware } from '../middleware/auth.js';
import { success, error } from '../utils/response.js';
import * as GenerationService from '../services/generation.js';
import { GenerationError } from '../services/generation.js';
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
  if (code >= 40001 && code <= 40099) return 400;
  if (code >= 40101 && code <= 40199) return 401;
  if (code >= 40201 && code <= 40299) return 402;
  if (code >= 40301 && code <= 40399) return 403;
  if (code >= 40401 && code <= 40499) return 404;
  if (code >= 40901 && code <= 40999) return 409;
  if (code >= 42201 && code <= 42299) return 422;
  if (code >= 50201 && code <= 50299) return 502;
  if (code >= 50301 && code <= 50399) return 503;
  if (code >= 50401 && code <= 50499) return 504;
  return 400;
}

function handleServiceError(res, err, scope) {
  if (err instanceof GenerationError || Number.isInteger(err.code)) {
    const details = err.extra && Object.keys(err.extra).length ? err.extra : null;
    return error(res, err.code, err.message, mapCodeToHttpStatus(err.code), details);
  }
  logger.error(`${scope}异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

router.use(authMiddleware);

router.post(
  '/image',
  [
    body('model').isLength({ min: 1, max: 100 }).withMessage('model 不能为空且不超过 100 字').trim(),
    body('prompt').optional({ nullable: true }).isString().withMessage('prompt 必须为字符串'),
    body('size').optional({ nullable: true }).isString().withMessage('size 必须为字符串'),
    body('n').optional().isInt({ min: 1, max: 10 }).withMessage('n 需为 1-10').toInt(),
    body('image').optional({ nullable: true }).custom((value) => typeof value === 'string' || Array.isArray(value)).withMessage('image 必须为字符串或数组')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await GenerationService.generateImage(req.body, req.userId, req.auditContext);
      return success(res, result, '图片生成成功');
    } catch (err) {
      return handleServiceError(res, err, '图片生成');
    }
  }
);

router.get(
  '/image/:taskId',
  [param('taskId').isLength({ min: 1, max: 200 }).withMessage('taskId 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    return error(res, 40402, '当前图片生成接口已在服务端等待完成，暂无可查询的图片异步任务', 404);
  }
);

router.post(
  '/video',
  [
    body('model').isLength({ min: 1, max: 100 }).withMessage('model 不能为空且不超过 100 字').trim(),
    body('prompt').optional({ nullable: true }).isString().withMessage('prompt 必须为字符串'),
    body('first_frame_image').optional({ nullable: true }).isString().withMessage('first_frame_image 必须为字符串'),
    body('last_frame_image').optional({ nullable: true }).isString().withMessage('last_frame_image 必须为字符串'),
    body('images').optional({ nullable: true }).isArray().withMessage('images 必须为数组'),
    body('resolution').optional({ nullable: true }).isString().withMessage('resolution 必须为字符串'),
    body('ratio').optional({ nullable: true }).isString().withMessage('ratio 必须为字符串'),
    body('dur').optional({ nullable: true }).isInt({ min: 1, max: 60 }).withMessage('dur 需为 1-60').toInt()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await GenerationService.createVideoTask(req.body, req.userId, req.auditContext);
      return success(res, result, result.url ? '视频生成成功' : '视频任务已创建');
    } catch (err) {
      return handleServiceError(res, err, '视频生成');
    }
  }
);

router.get(
  '/video/:taskId',
  [param('taskId').isLength({ min: 1, max: 200 }).withMessage('taskId 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await GenerationService.queryVideoTask(req.params.taskId, req.userId);
      return success(res, result, '获取视频任务状态成功');
    } catch (err) {
      return handleServiceError(res, err, '视频任务查询');
    }
  }
);

export default router;
