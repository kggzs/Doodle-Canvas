// -*- coding: utf-8 -*-
/**
 * Admin 角色检查中间件
 * 需配合 authMiddleware 使用（前置已注入 req.user）
 * 非 Admin 角色返回 403 ROLE_REQUIRED
 */
import { error } from '../utils/response.js';

/**
 * Admin 角色检查中间件
 * @param {Object} req Express 请求对象
 * @param {Object} res Express 响应对象
 * @param {Function} next 下一个中间件
 */
export function adminMiddleware(req, res, next) {
  // 前置 authMiddleware 应已注入 req.user
  if (!req.user) {
    return error(res, 40101, '未认证，请先登录', 401);
  }
  if (req.user.role !== 'admin') {
    return error(res, 40302, '需要管理员权限', 403);
  }
  next();
}

export default adminMiddleware;
