// -*- coding: utf-8 -*-
/**
 * 管理端公告路由
 * 路径前缀：/api/admin/announcements
 */
import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';

import { error, paginate, success } from '../../utils/response.js';
import * as AnnouncementService from '../../services/announcements.js';
import { AnnouncementError } from '../../services/announcements.js';
import { logger } from '../../utils/logger.js';

const router = Router();
const statuses = ['draft', 'published', 'archived'];

function validateRequest(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, 42201, '参数校验失败', 422, errors.array());
  }
  return undefined;
}

function handleServiceError(res, err) {
  if (err instanceof AnnouncementError) {
    const status = err.code >= 40401 && err.code <= 40499 ? 404 : 422;
    return error(res, err.code, err.message, status, Object.keys(err.extra || {}).length ? err.extra : null);
  }
  logger.error(`公告管理接口异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('页码需为正整数').toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页条数需为 1-100').toInt(),
    query('status').optional().isIn(statuses).withMessage('status 不支持'),
    query('keyword').optional().isString().trim()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AnnouncementService.listAnnouncements(req.query);
      return paginate(res, result);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.post(
  '/',
  [
    body('title').isLength({ min: 1, max: 200 }).withMessage('标题不能为空且不超过 200 字').trim(),
    body('content').isLength({ min: 1 }).withMessage('内容不能为空').trim(),
    body('status').optional().isIn(statuses).withMessage('status 不支持'),
    body('priority').optional().isInt().withMessage('priority 必须为整数').toInt(),
    body('published_at').optional({ nullable: true }).isISO8601().withMessage('published_at 必须为 ISO 时间')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const announcement = await AnnouncementService.createAnnouncement(req.body, req.user?.id || null);
      return success(res, { announcement }, '公告已创建');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.put(
  '/:id',
  [
    param('id').isUUID().withMessage('公告 ID 格式不正确'),
    body('title').optional().isLength({ min: 1, max: 200 }).withMessage('标题不能为空且不超过 200 字').trim(),
    body('content').optional().isLength({ min: 1 }).withMessage('内容不能为空').trim(),
    body('status').optional().isIn(statuses).withMessage('status 不支持'),
    body('priority').optional().isInt().withMessage('priority 必须为整数').toInt(),
    body('published_at').optional({ nullable: true }).isISO8601().withMessage('published_at 必须为 ISO 时间')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const announcement = await AnnouncementService.updateAnnouncement(req.params.id, req.body);
      return success(res, { announcement }, '公告已更新');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.delete(
  '/:id',
  [param('id').isUUID().withMessage('公告 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AnnouncementService.deleteAnnouncement(req.params.id);
      return success(res, result, '公告已删除');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
