// -*- coding: utf-8 -*-
/**
 * 用户侧文件路由
 * - POST /api/upload/image
 * - GET /api/files/:id
 * - DELETE /api/files/:id
 */
import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';

import { authMiddleware } from '../middleware/auth.js';
import { error, success } from '../utils/response.js';
import * as StorageService from '../services/storage.js';
import { StorageError } from '../services/storage.js';
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
  if (code >= 40101 && code <= 40199) return 401;
  if (code >= 40401 && code <= 40499) return 404;
  if (code >= 40901 && code <= 40999) return 409;
  if (code >= 42201 && code <= 42299) return 422;
  if (code >= 50201 && code <= 50299) return 502;
  return 400;
}

function handleServiceError(res, err) {
  if (err instanceof StorageError || Number.isInteger(err.code)) {
    return error(res, err.code, err.message, mapCodeToHttpStatus(err.code), Object.keys(err.extra || {}).length ? err.extra : null);
  }
  logger.error(`文件接口异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

router.use(authMiddleware);

router.post('/upload/image', StorageService.uploadImageMiddleware.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      throw new StorageError(42201, '请上传图片文件');
    }
    const file = await StorageService.saveBuffer({
      buffer: req.file.buffer,
      userId: req.userId,
      type: 'upload',
      originalName: req.file.originalname,
      mimeType: req.file.mimetype
    });
    return success(res, { file }, '图片上传成功');
  } catch (err) {
    return handleServiceError(res, err);
  }
});

router.get(
  '/files/:id',
  [param('id').isUUID().withMessage('文件 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const file = await StorageService.getFileForUser(req.params.id, req.userId);
      return success(res, { file }, '获取文件成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.delete(
  '/files/:id',
  [
    param('id').isUUID().withMessage('文件 ID 格式不正确'),
    body('reason').optional({ nullable: true }).isString().isLength({ max: 255 }).withMessage('删除原因不能超过 255 字')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const file = await StorageService.softDeleteFile(req.params.id, req.userId, {
        deletedByType: 'user',
        reason: req.body.reason || null
      });
      return success(res, { file }, '文件已删除');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
