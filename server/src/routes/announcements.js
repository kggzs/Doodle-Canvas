// -*- coding: utf-8 -*-
/**
 * 用户侧公告路由
 * 路径前缀：/api/announcements
 */
import { Router } from 'express';
import { param, query, validationResult } from 'express-validator';

import { error, success } from '../utils/response.js';
import * as AnnouncementService from '../services/announcements.js';
import { AnnouncementError } from '../services/announcements.js';
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
  if (err instanceof AnnouncementError) {
    return error(res, err.code, err.message, err.code >= 40401 && err.code <= 40499 ? 404 : 422);
  }
  logger.error(`公告接口异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

router.get(
  '/latest',
  [query('limit').optional().isInt({ min: 1, max: 10 }).withMessage('limit 需为 1-10').toInt()],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const items = await AnnouncementService.listLatestPublished(req.query.limit);
      return success(res, { items }, '获取公告成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.get(
  '/:id',
  [param('id').isUUID().withMessage('公告 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const announcement = await AnnouncementService.getPublishedAnnouncement(req.params.id);
      return success(res, { announcement }, '获取公告详情成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
