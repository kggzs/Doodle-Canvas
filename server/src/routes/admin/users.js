// -*- coding: utf-8 -*-
/**
 * 管理端用户管理路由
 * 路径前缀：/api/admin/users
 */
import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';

import { success, error, paginate } from '../../utils/response.js';
import * as AdminUserService from '../../services/admin-users.js';
import { AdminUserError } from '../../services/admin-users.js';
import { CoinError } from '../../services/coins.js';
import { UserGroupError } from '../../services/user-groups.js';
import { logger } from '../../utils/logger.js';

const router = Router();

const userStatuses = ['active', 'disabled', 'banned', 'pending_email'];
const userRoles = ['user', 'admin'];
const riskLevels = ['low', 'medium', 'high'];
const dbIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dbIdBody(name, label) {
  return body(name).matches(dbIdPattern).withMessage(`${label}格式不正确`);
}

function optionalDbIdBody(name, label) {
  return body(name).optional({ nullable: true }).matches(dbIdPattern).withMessage(`${label}格式不正确`);
}

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
  if (code >= 50001 && code <= 50099) return 500;
  return 400;
}

function handleServiceError(res, err) {
  if (err instanceof AdminUserError || err instanceof CoinError || err instanceof UserGroupError) {
    return error(res, err.code, err.message, mapCodeToHttpStatus(err.code), Object.keys(err.extra).length ? err.extra : null);
  }
  logger.error(`用户管理服务异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

function userPayload(body) {
  return {
    username: body.username,
    email: body.email,
    role: body.role,
    status: body.status,
    avatarUrl: body.avatar_url ?? body.avatarUrl,
    userGroupId: body.user_group_id ?? body.userGroupId,
    riskLevel: body.risk_level ?? body.riskLevel,
    riskTags: body.risk_tags ?? body.riskTags,
    violationCount: body.violation_count ?? body.violationCount,
    coinsFrozen: body.coins_frozen ?? body.coinsFrozen,
    emailVerified: body.email_verified ?? body.emailVerified
  };
}

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('页码需为正整数').toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页条数需为 1-100').toInt(),
    query('status').optional().isIn(userStatuses).withMessage('status 不支持'),
    query('role').optional().isIn(userRoles).withMessage('role 不支持'),
    query('risk_level').optional().isIn(riskLevels).withMessage('risk_level 不支持'),
    query('keyword').optional().isString().trim(),
    query('register_ip').optional().isString().trim(),
    query('include_deleted').optional().isBoolean().withMessage('include_deleted 必须为布尔值').toBoolean()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AdminUserService.listUsers({
        page: req.query.page,
        pageSize: req.query.pageSize,
        status: req.query.status,
        role: req.query.role,
        riskLevel: req.query.risk_level,
        keyword: req.query.keyword,
        registerIp: req.query.register_ip,
        includeDeleted: req.query.include_deleted
      });
      return paginate(res, result);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.get(
  '/:id',
  [param('id').isUUID().withMessage('用户 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AdminUserService.getUserDetail(req.params.id);
      return success(res, result, '获取用户详情成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.put(
  '/:id',
  [
    param('id').isUUID().withMessage('用户 ID 格式不正确'),
    body('username').optional().isLength({ min: 3, max: 50 }).matches(/^[a-zA-Z0-9_]+$/).withMessage('用户名需为 3-50 位字母、数字或下划线'),
    body('email').optional().isEmail().withMessage('邮箱格式不正确').normalizeEmail(),
    body('role').optional().isIn(userRoles).withMessage('role 不支持'),
    body('status').optional().isIn(userStatuses).withMessage('status 不支持'),
    body('avatar_url').optional({ nullable: true }).isString().withMessage('avatar_url 必须为字符串'),
    optionalDbIdBody('user_group_id', 'user_group_id '),
    body('risk_level').optional().isIn(riskLevels).withMessage('risk_level 不支持'),
    body('risk_tags').optional({ nullable: true }).isArray().withMessage('risk_tags 必须为数组'),
    body('violation_count').optional().isInt({ min: 0 }).withMessage('violation_count 需为非负整数').toInt(),
    body('coins_frozen').optional().isDecimal({ decimal_digits: '0,2' }).withMessage('coins_frozen 格式不正确'),
    body('email_verified').optional().isBoolean().withMessage('email_verified 必须为布尔值').toBoolean()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AdminUserService.updateUser(req.params.id, userPayload(req.body), req.user?.id);
      return success(res, result, '用户信息已更新');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.put(
  '/:id/status',
  [
    param('id').isUUID().withMessage('用户 ID 格式不正确'),
    body('status').isIn(userStatuses).withMessage('status 不支持')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AdminUserService.setUserStatus(req.params.id, req.body.status, req.user?.id);
      return success(res, result, '用户状态已更新');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.post(
  '/:id/ban',
  [
    param('id').isUUID().withMessage('用户 ID 格式不正确'),
    body('ban_reason').optional().isLength({ min: 1, max: 500 }).withMessage('ban_reason 不超过 500 字'),
    body('banned_until').optional({ nullable: true }).isISO8601().withMessage('banned_until 必须为 ISO 时间'),
    body('risk_level').optional().isIn(riskLevels).withMessage('risk_level 不支持'),
    body('violation_count').optional().isInt({ min: 0 }).withMessage('violation_count 需为非负整数').toInt()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AdminUserService.banUser(req.params.id, {
        banReason: req.body.ban_reason,
        bannedUntil: req.body.banned_until,
        riskLevel: req.body.risk_level,
        violationCount: req.body.violation_count
      }, req.user?.id);
      return success(res, result, '用户已封禁');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.post(
  '/:id/unban',
  [param('id').isUUID().withMessage('用户 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AdminUserService.unbanUser(req.params.id);
      return success(res, result, '用户已解封');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.get(
  '/:id/login-logs',
  [
    param('id').isUUID().withMessage('用户 ID 格式不正确'),
    query('page').optional().isInt({ min: 1 }).withMessage('页码需为正整数').toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页条数需为 1-100').toInt(),
    query('status').optional().isIn(['success', 'failed', 'locked', 'disabled', 'banned', 'pending_email']).withMessage('status 不支持')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AdminUserService.getUserLoginLogs(req.params.id, {
        page: req.query.page,
        pageSize: req.query.pageSize,
        status: req.query.status
      });
      return paginate(res, result);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.get(
  '/:id/groups',
  [param('id').isUUID().withMessage('用户 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AdminUserService.getUserGroups(req.params.id);
      return success(res, result, '获取用户分组成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.get(
  '/:id/projects',
  [
    param('id').isUUID().withMessage('用户 ID 格式不正确'),
    query('page').optional().isInt({ min: 1 }).withMessage('页码需为正整数').toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页条数需为 1-100').toInt()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AdminUserService.getUserProjects(req.params.id, {
        page: req.query.page,
        pageSize: req.query.pageSize
      });
      return paginate(res, result);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.put(
  '/:id/password',
  [
    param('id').isUUID().withMessage('用户 ID 格式不正确'),
    body('newPassword').isLength({ min: 8 }).withMessage('新密码至少 8 位').matches(/^(?=.*[a-zA-Z])(?=.*[0-9]).+$/).withMessage('新密码需同时包含字母和数字')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AdminUserService.adminChangePassword(req.params.id, req.body.newPassword, req.user?.id);
      return success(res, result, '密码已修改，用户需重新登录');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.get(
  '/:id/coins',
  [
    param('id').isUUID().withMessage('用户 ID 格式不正确'),
    query('page').optional().isInt({ min: 1 }).withMessage('页码需为正整数').toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页条数需为 1-100').toInt()
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AdminUserService.getUserCoinTransactions(req.params.id, {
        page: req.query.page,
        pageSize: req.query.pageSize
      });
      return paginate(res, result);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.post(
  '/:id/groups',
  [
    param('id').isUUID().withMessage('用户 ID 格式不正确'),
    dbIdBody('group_id', 'group_id '),
    body('expires_at').optional({ nullable: true }).isISO8601().withMessage('expires_at 必须为 ISO 时间'),
    body('grant_reason').optional({ nullable: true }).isLength({ max: 255 }).withMessage('grant_reason 不超过 255 字')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AdminUserService.assignUserGroup(
        req.params.id,
        req.body.group_id,
        {
          expiresAt: req.body.expires_at,
          grantReason: req.body.grant_reason
        },
        req.user?.id
      );
      return success(res, result, '用户组已分配');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.delete(
  '/:id/groups/:groupId',
  [
    param('id').isUUID().withMessage('用户 ID 格式不正确'),
    dbIdParam('groupId', '用户组 ID ')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AdminUserService.removeUserGroup(req.params.id, req.params.groupId);
      return success(res, result, '用户组已移除');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.post(
  '/:id/recharge',
  [
    param('id').isUUID().withMessage('用户 ID 格式不正确'),
    body('amount').isDecimal({ decimal_digits: '0,2' }).withMessage('amount 格式不正确'),
    body('reason').optional({ nullable: true }).isLength({ max: 255 }).withMessage('reason 不超过 255 字'),
    body('payment_channel').optional({ nullable: true }).isLength({ max: 40 }).withMessage('payment_channel 不超过 40 字'),
    body('external_order_no').optional({ nullable: true }).isLength({ max: 80 }).withMessage('external_order_no 不超过 80 字')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AdminUserService.rechargeUser(req.params.id, {
        amount: req.body.amount,
        reason: req.body.reason,
        paymentChannel: req.body.payment_channel,
        externalOrderNo: req.body.external_order_no
      }, req.user?.id, res.locals?.requestId);
      return success(res, result, '用户充值成功');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.post(
  '/:id/gift',
  [
    param('id').isUUID().withMessage('用户 ID 格式不正确'),
    body('amount').isDecimal({ decimal_digits: '0,2' }).withMessage('amount 格式不正确'),
    body('reason').optional({ nullable: true }).isLength({ max: 255 }).withMessage('reason 不超过 255 字'),
    body('scene').optional({ nullable: true }).isLength({ max: 40 }).withMessage('scene 不超过 40 字')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AdminUserService.giftUser(req.params.id, {
        amount: req.body.amount,
        reason: req.body.reason,
        scene: req.body.scene
      }, req.user?.id, res.locals?.requestId);
      return success(res, result, '金币已赠送');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.post(
  '/:id/adjust-coins',
  [
    param('id').isUUID().withMessage('用户 ID 格式不正确'),
    body('amount').isDecimal({ decimal_digits: '0,2' }).withMessage('amount 格式不正确'),
    body('mode').isIn(['increase', 'decrease']).withMessage('mode 不支持'),
    body('reason').optional({ nullable: true }).isLength({ max: 255 }).withMessage('reason 不超过 255 字')
  ],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AdminUserService.adjustUserCoins(req.params.id, {
        amount: req.body.amount,
        mode: req.body.mode,
        reason: req.body.reason
      }, req.user?.id, res.locals?.requestId);
      return success(res, result, '金币已调整');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.delete(
  '/:id',
  [param('id').isUUID().withMessage('用户 ID 格式不正确')],
  async (req, res) => {
    const validErr = validateRequest(req, res);
    if (validErr) return validErr;

    try {
      const result = await AdminUserService.softDeleteUser(req.params.id, req.user?.id);
      return success(res, result, '用户已删除');
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
