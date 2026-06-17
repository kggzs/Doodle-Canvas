// -*- coding: utf-8 -*-
/**
 * JWT 鉴权中间件
 * - auth.required：必须登录，验证 JWT + Redis 黑名单 + 用户状态
 * - auth.optional：可选鉴权，有 Token 则解析，无 Token 放行
 * - auth.refreshRequired：Refresh Token 鉴权，校验 refresh_tokens 表有效性
 *
 * 错误码：
 * - 40101 TOKEN_INVALID：令牌无效或未提供
 * - 40102 TOKEN_EXPIRED：令牌已过期
 * - 40104 EMAIL_NOT_VERIFIED：邮箱未验证（pending_email）
 * - 40303 BANNED：账号已封禁（附带 ban_reason/banned_until）
 * - 40304 ACCOUNT_DISABLED：账号已禁用
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/auth.js';
import { redis } from '../config/redis.js';
import { sequelize } from '../config/database.js';
import { error } from '../utils/response.js';
import { logger } from '../utils/logger.js';

/**
 * 从请求头提取 Bearer Token
 * @param {Object} req Express 请求对象
 * @returns {string|null} Token 字符串
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  // 格式：Bearer <token>
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

/**
 * 对 Token 做 SHA-256 哈希，用于 Redis 黑名单 key 与 refresh_tokens 表查询
 * @param {string} token 原始 Token 字符串
 * @returns {string} 64 位十六进制哈希值
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * 检查 Token 是否在 Redis 黑名单中
 * 同时检查 jti 维度与 tokenHash 维度，任一命中即视为已吊销
 * Redis 不可用时降级放行（仅记录警告），保证服务可用性
 * @param {string} token 原始 Token
 * @param {Object} payload JWT 解码后的 payload
 * @returns {Promise<boolean>} true 表示已列入黑名单
 */
async function isTokenBlacklisted(token, payload) {
  const tokenHash = hashToken(token);
  // 构建待查 key 列表：优先 jti，兜底 tokenHash
  const keys = [];
  if (payload.jti) {
    keys.push(`blacklist:token:${payload.jti}`);
  }
  keys.push(`blacklist:token:${tokenHash}`);

  try {
    const results = await redis.mget(...keys);
    return results.some((v) => v !== null);
  } catch (err) {
    // Redis 不可用时降级放行，仅记录警告
    logger.warn(`Redis 黑名单检查失败（降级放行）：${err.message}`);
    return false;
  }
}

/**
 * 根据 userId 查询用户最新状态
 * 使用原生 SQL 查询，避免依赖尚未注册的 Sequelize 模型
 * @param {number|string} userId 用户 ID
 * @returns {Promise<Object|null>} 用户记录（含 id/username/email/role/status/ban_reason/banned_until）
 */
async function findUserById(userId) {
  const [rows] = await sequelize.query(
    'SELECT id, username, email, role, status, ban_reason, banned_until FROM users WHERE id = ? LIMIT 1',
    { replacements: [userId] }
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * 根据用户状态返回对应的错误响应
 * - banned → 40303（附带 ban_reason/banned_until）
 * - disabled → 40304
 * - pending_email → 40104
 * @param {Object} res Express 响应对象
 * @param {Object} user 用户记录
 * @returns {Object|undefined} Express 响应（若状态异常），undefined 表示状态正常
 */
function rejectByStatus(res, user) {
  // 账号已封禁
  if (user.status === 'banned') {
    return error(res, 40303, '账号已被封禁', 403, {
      ban_reason: user.ban_reason || null,
      banned_until: user.banned_until || null
    });
  }
  // 账号已禁用
  if (user.status === 'disabled') {
    return error(res, 40304, '账号已被禁用，请联系管理员', 403);
  }
  // 邮箱未验证
  if (user.status === 'pending_email') {
    return error(res, 40104, '邮箱未验证，请先完成邮箱验证', 401);
  }
  return undefined;
}

/**
 * 将 JWT payload 与数据库用户记录合并，注入 req.user 与 req.userId
 * @param {Object} req Express 请求对象
 * @param {Object} user 数据库用户记录
 */
function injectUser(req, user) {
  req.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status
  };
  req.userId = user.id;
}

/**
 * 必须登录中间件（auth.required）
 * 流程：提取 Token → 验证 JWT → 检查黑名单 → 查询用户状态 → 注入 req.user
 * @param {Object} req Express 请求对象
 * @param {Object} res Express 响应对象
 * @param {Function} next 下一个中间件
 */
async function requiredAuth(req, res, next) {
  // 1. 提取 Bearer Token
  const token = extractToken(req);
  if (!token) {
    return error(res, 40101, '未提供有效的认证令牌', 401);
  }

  // 2. 验证 JWT 签名与有效期
  let payload;
  try {
    payload = jwt.verify(token, jwtConfig.secret);
  } catch (err) {
    logger.warn(`Token 验证失败：${err.message}`, { request_id: res.locals.requestId });
    if (err.name === 'TokenExpiredError') {
      return error(res, 40102, '令牌已过期，请刷新或重新登录', 401);
    }
    return error(res, 40101, '认证令牌无效', 401);
  }

  // 3. 检查 Redis 黑名单
  const blacklisted = await isTokenBlacklisted(token, payload);
  if (blacklisted) {
    return error(res, 40101, '令牌已失效，请重新登录', 401);
  }

  // 4. 查询用户最新状态
  let user;
  try {
    user = await findUserById(payload.userId);
  } catch (err) {
    logger.error(`查询用户状态失败：${err.message}`, { request_id: res.locals.requestId });
    return error(res, 50001, '用户状态验证服务暂时不可用', 500);
  }
  if (!user) {
    return error(res, 40101, '用户不存在，令牌无效', 401);
  }

  // 5. 检查用户状态（封禁/禁用/未验证）
  const statusError = rejectByStatus(res, user);
  if (statusError) return statusError;

  // 6. 注入 req.user 与 req.userId
  injectUser(req, user);
  next();
}

/**
 * 可选鉴权中间件（auth.optional）
 * 有 Token 则执行鉴权流程，无 Token 时 req.user = null，不报错
 * Token 无效时也不报错，仅置空（适用于公开接口需感知登录状态的场景）
 * @param {Object} req Express 请求对象
 * @param {Object} res Express 响应对象
 * @param {Function} next 下一个中间件
 */
async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  // 无 Token 直接放行
  if (!token) {
    req.user = null;
    req.userId = null;
    return next();
  }

  // 验证 JWT
  let payload;
  try {
    payload = jwt.verify(token, jwtConfig.secret);
  } catch {
    // 可选鉴权下 Token 无效不报错，仅置空
    req.user = null;
    req.userId = null;
    return next();
  }

  // 检查黑名单
  const blacklisted = await isTokenBlacklisted(token, payload);
  if (blacklisted) {
    req.user = null;
    req.userId = null;
    return next();
  }

  // 查询用户状态
  try {
    const user = await findUserById(payload.userId);
    if (!user || user.status !== 'active') {
      // 用户不存在或状态异常时，可选鉴权不报错，仅置空
      req.user = null;
      req.userId = null;
      return next();
    }
    injectUser(req, user);
  } catch {
    // 查询失败时静默置空
    req.user = null;
    req.userId = null;
  }
  next();
}

/**
 * Refresh Token 鉴权中间件（auth.refreshRequired）
 * 从 body.refreshToken 或 header（x-refresh-token / Authorization Bearer）提取 refreshToken
 * 验证 JWT 签名后，检查 refresh_tokens 表中是否有效（未过期、未撤销）
 * @param {Object} req Express 请求对象
 * @param {Object} res Express 响应对象
 * @param {Function} next 下一个中间件
 */
async function refreshRequiredAuth(req, res, next) {
  // 1. 从 body 或 header 提取 refreshToken
  const refreshToken = req.body?.refreshToken
    || req.headers['x-refresh-token']
    || extractToken(req);
  if (!refreshToken) {
    return error(res, 40101, '未提供刷新令牌', 401);
  }

  // 2. 验证 JWT 签名与有效期
  let payload;
  try {
    payload = jwt.verify(refreshToken, jwtConfig.secret);
  } catch (err) {
    logger.warn(`Refresh Token 验证失败：${err.message}`, { request_id: res.locals.requestId });
    if (err.name === 'TokenExpiredError') {
      return error(res, 40102, '刷新令牌已过期，请重新登录', 401);
    }
    return error(res, 40101, '刷新令牌无效', 401);
  }

  // 3. 检查 refresh_tokens 表中是否有效（未过期、未撤销）
  const tokenHash = hashToken(refreshToken);
  let tokenRecord;
  try {
    const [rows] = await sequelize.query(
      'SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ? LIMIT 1',
      { replacements: [tokenHash] }
    );
    tokenRecord = rows.length > 0 ? rows[0] : null;
  } catch (err) {
    logger.error(`查询 refresh_tokens 失败：${err.message}`, { request_id: res.locals.requestId });
    return error(res, 50001, '令牌验证服务暂时不可用', 500);
  }

  // 令牌不存在于数据库（已被清除或伪造）
  if (!tokenRecord) {
    return error(res, 40101, '刷新令牌不存在或已失效', 401);
  }
  // 令牌已被撤销
  if (tokenRecord.revoked_at) {
    return error(res, 40101, '刷新令牌已被撤销，请重新登录', 401);
  }
  // 令牌已过期（数据库层面二次校验）
  if (tokenRecord.expires_at && new Date(tokenRecord.expires_at) < new Date()) {
    return error(res, 40102, '刷新令牌已过期，请重新登录', 401);
  }

  // 4. 查询用户状态，确保账号可用
  let user;
  try {
    user = await findUserById(tokenRecord.user_id);
  } catch (err) {
    logger.error(`查询用户状态失败：${err.message}`, { request_id: res.locals.requestId });
    return error(res, 50001, '用户状态验证服务暂时不可用', 500);
  }
  if (!user) {
    return error(res, 40101, '用户不存在', 401);
  }

  // 封禁/禁用账号不允许刷新令牌
  const statusError = rejectByStatus(res, user);
  if (statusError) return statusError;

  // 5. 注入 req.user、req.userId 与 req.refreshTokenRecord
  injectUser(req, user);
  req.refreshTokenRecord = tokenRecord;
  next();
}

/**
 * 鉴权中间件集合
 * - required：必须登录
 * - optional：可选鉴权
 * - refreshRequired：Refresh Token 鉴权
 */
export const auth = {
  required: requiredAuth,
  optional: optionalAuth,
  refreshRequired: refreshRequiredAuth
};

// 向后兼容的命名导出（供现有路由引用）
export { requiredAuth as authMiddleware };
export { optionalAuth as optionalAuthMiddleware };
export { refreshRequiredAuth as refreshAuthMiddleware };

export default auth;
