// -*- coding: utf-8 -*-
/**
 * 用户侧对话路由
 * 路径前缀：/api/chat
 */
import { Router } from 'express';
import { body, validationResult } from 'express-validator';

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

function handleServiceError(res, err) {
  if (err instanceof GenerationError || Number.isInteger(err.code)) {
    return error(res, err.code, err.message, mapCodeToHttpStatus(err.code), Object.keys(err.extra).length ? err.extra : null);
  }
  logger.error(`对话代理异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

const chatValidators = [
  body('model').isLength({ min: 1, max: 100 }).withMessage('model 不能为空且不超过 100 字').trim(),
  body('messages').isArray({ min: 1 }).withMessage('messages 必须为非空数组'),
  body('messages.*.role').isIn(['system', 'user', 'assistant', 'tool']).withMessage('message.role 不支持'),
  body('temperature').optional({ nullable: true }).isFloat({ min: 0, max: 2 }).withMessage('temperature 需在 0-2 之间').toFloat(),
  body('max_tokens').optional({ nullable: true }).isInt({ min: 1 }).withMessage('max_tokens 需为正整数').toInt()
];

router.use(authMiddleware);

router.post('/completions', chatValidators, async (req, res) => {
  const validErr = validateRequest(req, res);
  if (validErr) return validErr;

  try {
    const result = await GenerationService.chatCompletions(req.body, req.userId, req.auditContext);
    return success(res, result, '对话完成');
  } catch (err) {
    return handleServiceError(res, err);
  }
});

router.post('/completions/stream', chatValidators, async (req, res) => {
  const validErr = validateRequest(req, res);
  if (validErr) return validErr;

  try {
    const result = await GenerationService.streamChatCompletions(req.body, req.userId, req.auditContext);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    result.stream.on('error', (err) => {
      logger.warn(`对话流转发失败：${err.message}`, {
        model: result.model,
        channel_id: result.channel?.id
      });
      if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ code: 50201, message: err.message })}\n\n`);
        res.end();
      }
    });

    result.stream.pipe(res);
  } catch (err) {
    return handleServiceError(res, err);
  }
});

export default router;
