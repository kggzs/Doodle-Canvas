// -*- coding: utf-8 -*-
/**
 * 认证路由
 * 提供 15 个认证 API 接口：
 * - POST   /register              注册
 * - POST   /verify-email          邮箱验证
 * - POST   /resend-verification   重发验证码
 * - POST   /check-email           检查邮箱可用性
 * - POST   /login                 登录
 * - POST   /logout                退出
 * - POST   /refresh               刷新 Token
 * - GET    /me                    获取当前用户
 * - PUT    /password              修改密码
 * - POST   /forgot-password       忘记密码
 * - POST   /reset-password        重置密码
 * - POST   /change-email          换绑邮箱
 * - GET    /sessions              会话列表
 * - DELETE /sessions/:id          注销会话
 * - GET    /login-logs            登录记录
 *
 * 每个接口：
 * 1. 使用 express-validator 校验入参
 * 2. 调用 AuthService 对应方法
 * 3. 使用 response.success/error 返回统一格式
 * 4. 错误处理：捕获 Service 抛出的业务错误，映射到对应错误码
 */
import { Router } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import crypto from 'crypto';

import { success, error, paginate } from '../utils/response.js';
import { auth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { logger } from '../utils/logger.js';
import * as AuthService from '../services/auth.js';
import { AuthError } from '../services/auth.js';
import RefreshToken from '../models/RefreshToken.js';

const router = Router();

// ============================
// 工具函数
// ============================
/**
 * 提取 Bearer Token
 * @param {Object} req Express 请求对象
 * @returns {string|null} Token 字符串
 */
function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

/**
 * 校验入参结果，失败返回 422
 * @param {Object} req Express 请求对象
 * @param {Object} res Express 响应对象
 * @returns {Object|undefined} 错误响应或 undefined
 */
function validateRequest(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, 42201, '参数校验失败', 422, errors.array());
  }
  return undefined;
}

/**
 * 统一处理 Service 抛出的业务错误
 * @param {Object} res Express 响应对象
 * @param {Error} err 异常对象
 * @returns {Object} Express 响应
 */
function handleServiceError(res, err) {
  // 业务错误（AuthError）：按 code 与 extra 返回
  if (err instanceof AuthError) {
    // 根据错误码映射 HTTP 状态码
    const httpStatus = mapCodeToHttpStatus(err.code);
    return error(res, err.code, err.message, httpStatus, Object.keys(err.extra).length ? err.extra : null);
  }
  // 未知异常：记录日志并返回 500
  logger.error(`认证服务未知异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

/**
 * 根据业务错误码映射 HTTP 状态码
 * @param {number} code 业务错误码
 * @returns {number} HTTP 状态码
 */
function mapCodeToHttpStatus(code) {
  // 401 类：未认证
  if (code >= 40101 && code <= 40199) return 401;
  // 403 类：禁止访问
  if (code >= 40301 && code <= 40399) return 403;
  // 404 类：资源不存在
  if (code >= 40401 && code <= 40499) return 404;
  // 409 类：冲突
  if (code >= 40901 && code <= 40999) return 409;
  // 422 类：参数错误
  if (code >= 42201 && code <= 42299) return 422;
  // 429 类：限流
  if (code >= 42901 && code <= 42999) return 429;
  return 400;
}

// ============================
// 1. POST /register 注册
// ============================
router.post(
  '/register',
  rateLimit.create({ windowMs: 60 * 1000, max: 5, key: 'rate_limit:auth_register' }),
  [
    body('email').isEmail().withMessage('邮箱格式不正确').normalizeEmail(),
    body('username').isLength({ min: 3, max: 50 }).matches(/^[a-zA-Z0-9_]+$/).withMessage('用户名需为 3-50 位字母、数字或下划线'),
    body('password').isLength({ min: 8 }).withMessage('密码至少 8 位').matches(/^(?=.*[a-zA-Z])(?=.*[0-9]).+$/).withMessage('密码需同时包含字母和数字')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AuthService.register({
        email: req.body.email,
        username: req.body.username,
        password: req.body.password,
        auditContext: req.auditContext
      });
      return success(res, result, '注册成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

// ============================
// 2. POST /verify-email 邮箱验证
// ============================
router.post(
  '/verify-email',
  rateLimit.create({ windowMs: 60 * 1000, max: 10, key: 'rate_limit:auth_verify_email' }),
  [
    body('email').isEmail().withMessage('邮箱格式不正确').normalizeEmail(),
    body('code').isLength({ min: 6, max: 6 }).isNumeric().withMessage('验证码为 6 位数字')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AuthService.verifyEmail({
        email: req.body.email,
        code: req.body.code,
        auditContext: req.auditContext
      });
      return success(res, result, '邮箱验证成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

// ============================
// 3. POST /resend-verification 重发验证码
// ============================
router.post(
  '/resend-verification',
  rateLimit.create({ windowMs: 60 * 1000, max: 3, key: 'rate_limit:auth_resend' }),
  [body('email').isEmail().withMessage('邮箱格式不正确').normalizeEmail()],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AuthService.resendVerification({
        email: req.body.email,
        auditContext: req.auditContext
      });
      return success(res, result, '验证码已重发');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

// ============================
// 4. POST /check-email 检查邮箱
// ============================
router.post(
  '/check-email',
  rateLimit.create({ windowMs: 60 * 1000, max: 10, key: 'rate_limit:auth_check_email' }),
  [body('email').isEmail().withMessage('邮箱格式不正确').normalizeEmail()],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AuthService.checkEmail({ email: req.body.email });
      return success(res, result, '查询成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

// ============================
// 5. POST /login 登录
// ============================
router.post(
  '/login',
  rateLimit.create({ windowMs: 60 * 1000, max: 20, key: 'rate_limit:auth_login' }),
  [
    body('emailOrUsername').notEmpty().withMessage('账号不能为空'),
    body('password').notEmpty().withMessage('密码不能为空')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AuthService.login({
        emailOrUsername: req.body.emailOrUsername,
        password: req.body.password,
        auditContext: req.auditContext
      });
      return success(res, result, '登录成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

// ============================
// 6. POST /logout 退出
// ============================
router.post('/logout', auth.required, async (req, res) => {
  try {
    // 从 body 或 header 提取 refreshToken 与 accessToken
    const refreshToken = req.body?.refreshToken || req.headers['x-refresh-token'];
    const accessToken = extractBearerToken(req);
    await AuthService.logout({
      refreshToken,
      accessToken,
      userId: req.userId
    });
    return success(res, null, '已退出登录');
  } catch (err) {
    return handleServiceError(res, err);
  }
});

// ============================
// 7. POST /refresh 刷新 Token
// ============================
router.post('/refresh', auth.refreshRequired, async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken
      || req.headers['x-refresh-token']
      || extractBearerToken(req);
    const result = await AuthService.refresh({
      refreshToken,
      auditContext: req.auditContext
    });
    return success(res, result, '令牌刷新成功');
  } catch (err) {
    return handleServiceError(res, err);
  }
});

// ============================
// 8. GET /me 获取当前用户
// ============================
router.get('/me', auth.required, async (req, res) => {
  try {
    const result = await AuthService.getProfile({ userId: req.userId });
    return success(res, result, '获取用户信息成功');
  } catch (err) {
    return handleServiceError(res, err);
  }
});

// ============================
// 9. PUT /password 修改密码
// ============================
router.put(
  '/password',
  auth.required,
  [
    body('oldPassword').notEmpty().withMessage('原密码不能为空'),
    body('newPassword').isLength({ min: 8 }).withMessage('新密码至少 8 位').matches(/^(?=.*[a-zA-Z])(?=.*[0-9]).+$/).withMessage('新密码需同时包含字母和数字')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      // 从 refreshToken 推断当前会话 ID（用于保留当前会话）
      const refreshToken = req.body?.refreshToken || req.headers['x-refresh-token'];
      let currentSessionId = null;
      if (refreshToken) {
        // 通过 token_hash 查询当前会话 ID
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const record = await RefreshToken.findOne({ where: { tokenHash } });
        currentSessionId = record?.id || null;
      }

      const result = await AuthService.changePassword({
        userId: req.userId,
        oldPassword: req.body.oldPassword,
        newPassword: req.body.newPassword,
        currentSessionId,
        auditContext: req.auditContext
      });
      return success(res, result, '密码修改成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

// ============================
// 10. POST /forgot-password 忘记密码
// ============================
router.post(
  '/forgot-password',
  rateLimit.create({ windowMs: 60 * 1000, max: 3, key: 'rate_limit:auth_forgot' }),
  [body('email').isEmail().withMessage('邮箱格式不正确').normalizeEmail()],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AuthService.forgotPassword({
        email: req.body.email,
        auditContext: req.auditContext
      });
      return success(res, result, '重置验证码已发送');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

// ============================
// 11. POST /reset-password 重置密码
// ============================
router.post(
  '/reset-password',
  rateLimit.create({ windowMs: 60 * 1000, max: 5, key: 'rate_limit:auth_reset' }),
  [
    body('email').isEmail().withMessage('邮箱格式不正确').normalizeEmail(),
    body('code').isLength({ min: 6, max: 6 }).isNumeric().withMessage('验证码为 6 位数字'),
    body('newPassword').isLength({ min: 8 }).withMessage('新密码至少 8 位').matches(/^(?=.*[a-zA-Z])(?=.*[0-9]).+$/).withMessage('新密码需同时包含字母和数字')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AuthService.resetPassword({
        email: req.body.email,
        code: req.body.code,
        newPassword: req.body.newPassword,
        auditContext: req.auditContext
      });
      return success(res, result, '密码重置成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

// ============================
// 12. POST /change-email 换绑邮箱
// ============================
router.post(
  '/change-email',
  auth.required,
  [body('newEmail').isEmail().withMessage('新邮箱格式不正确').normalizeEmail()],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AuthService.changeEmail({
        userId: req.userId,
        newEmail: req.body.newEmail,
        auditContext: req.auditContext
      });
      return success(res, result, '换绑邮箱验证码已发送');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

// ============================
// 13. GET /sessions 会话列表
// ============================
router.get('/sessions', auth.required, async (req, res) => {
  try {
    const sessions = await AuthService.getSessions({ userId: req.userId });
    return success(res, { items: sessions, total: sessions.length }, '获取会话列表成功');
  } catch (err) {
    return handleServiceError(res, err);
  }
});

// ============================
// 14. DELETE /sessions/:id 注销会话
// ============================
router.delete(
  '/sessions/:id',
  auth.required,
  [param('id').isUUID().withMessage('会话 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AuthService.revokeSession({
        userId: req.userId,
        sessionId: req.params.id
      });
      return success(res, result, '会话已注销');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

// ============================
// 15. GET /login-logs 登录记录
// ============================
router.get(
  '/login-logs',
  auth.required,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('页码需为正整数'),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页条数需为 1-100')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AuthService.getLoginLogs({
        userId: req.userId,
        page: req.query.page,
        pageSize: req.query.pageSize
      });
      return paginate(res, {
        items: result.items,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize
      });
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
