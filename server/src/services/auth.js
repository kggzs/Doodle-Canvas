// -*- coding: utf-8 -*-
/**
 * 认证服务
 * 提供完整的用户认证业务逻辑：
 * - register：注册（含邮箱验证码生成与发送）
 * - verifyEmail：邮箱验证（激活账号、签发令牌）
 * - login：登录（含 IP 限频、账号锁定、异地登录检测）
 * - logout：退出（撤销 refresh_token、access_token 加黑名单）
 * - refresh：刷新令牌
 * - forgotPassword / resetPassword：忘记密码与重置
 * - changePassword：修改密码
 * - getProfile / getSessions / revokeSession / getLoginLogs：用户信息与会话管理
 * - checkEmail / resendVerification：邮箱可用性检查与重发验证码
 *
 * 约定：
 * - Service 抛出包含 code 和 message 的 Error 对象，路由层捕获并映射
 * - bcrypt cost=12
 * - Access Token payload: { token_type: 'access', userId, username, role, jti }
 * - Refresh Token payload: { token_type: 'refresh', userId, jti }
 * - token_hash 存储 Refresh Token 的 SHA-256 哈希（不存原文）
 * - Redis 操作需处理连接失败情况（降级放行或仅记录日志）
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { Op } from 'sequelize';

import { jwtConfig } from '../config/auth.js';
import { redis } from '../config/redis.js';
import { rememberBlacklistedToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { randomInt } from '../utils/helpers.js';
import { parseUserAgent } from '../utils/ip-ua.js';

import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import EmailVerification from '../models/EmailVerification.js';
import LoginLog from '../models/LoginLog.js';
import UserGroup from '../models/UserGroup.js';
import UserGroupMember from '../models/UserGroupMember.js';
import * as EmailService from './email.js';
import * as CoinService from './coins.js';

// ============================
// 常量配置
// ============================
const BCRYPT_COST = 12; // bcrypt 加密成本因子
const CODE_LENGTH = 6; // 验证码长度
const CODE_EXPIRE_MINUTES = 30; // 验证码有效期 30 分钟
const CODE_MAX_ATTEMPTS = 5; // 验证码最大尝试次数

// 登录安全配置
const LOGIN_IP_WINDOW_MINUTES = 5; // IP 限频窗口 5 分钟
const LOGIN_IP_MAX_FAILURES = 20; // 同 IP 5 分钟内最多 20 次失败
const LOGIN_USER_MAX_FAILURES = 5; // 同账号连续失败 5 次锁定
const LOGIN_USER_LOCK_MINUTES = 15; // 账号锁定时长 15 分钟

// Redis key 前缀
const LOGIN_FAIL_IP_KEY = (ip) => `login_fail:ip:${ip}`;
const LOGIN_FAIL_USER_KEY = (userId) => `login_fail:user:${userId}`;
const BLACKLIST_TOKEN_KEY = (jti) => `blacklist:token:${jti}`;

// 注册赠送金币（后续 Task 15 实现 CoinService 后接入）
const REGISTER_GIFT_COINS = parseInt(process.env.REGISTER_GIFT_COINS || '100', 10);
const DEFAULT_NEW_USER_BALANCE = parseFloat(process.env.DEFAULT_NEW_USER_BALANCE || '10.00');

// ============================
// 工具函数
// ============================
/**
 * 业务错误类
 * 携带 code 与 message，供路由层捕获并映射为统一响应
 */
export class AuthError extends Error {
  /**
   * @param {number} code 业务错误码
   * @param {string} message 错误消息
   * @param {Object} [extra] 额外字段（如 ban_reason/banned_until）
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

/**
 * 校验邮箱格式
 * @param {string} email 邮箱
 * @returns {boolean} 是否合法
 */
function isValidEmail(email) {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

/**
 * 校验用户名规则（3-50 字符，字母数字下划线）
 * @param {string} username 用户名
 * @returns {boolean} 是否合法
 */
function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,50}$/.test(username);
}

/**
 * 校验密码强度（最少 8 位，含字母+数字）
 * @param {string} password 密码
 * @returns {boolean} 是否合法
 */
function isValidPassword(password) {
  if (!password || password.length < 8) return false;
  // 必须同时包含字母和数字
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  return hasLetter && hasDigit;
}

/**
 * 生成 6 位数字验证码
 * @returns {string} 6 位数字字符串
 */
function generateCode() {
  // 使用 randomInt 生成 000000-999999 的 6 位数字，左侧补零
  return String(randomInt(0, 999999)).padStart(CODE_LENGTH, '0');
}

/**
 * 对 Token 做 SHA-256 哈希
 * @param {string} token 原始 Token
 * @returns {string} 64 位十六进制哈希值
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * 生成 Access Token
 * @param {Object} user 用户实例（需含 id/username/role）
 * @returns {string} Access Token
 */
function signAccessToken(user) {
  const payload = {
    token_type: 'access',
    userId: user.id,
    username: user.username,
    role: user.role,
    jti: uuidv4()
  };
  return jwt.sign(payload, jwtConfig.secret, { expiresIn: jwtConfig.accessExpires });
}

/**
 * 生成 Refresh Token
 * @param {string} userId 用户 ID
 * @returns {string} Refresh Token
 */
function signRefreshToken(userId) {
  const payload = {
    token_type: 'refresh',
    userId,
    jti: uuidv4()
  };
  return jwt.sign(payload, jwtConfig.secret, { expiresIn: jwtConfig.refreshExpires });
}

/**
 * 解析 Refresh Token 过期时间（毫秒）
 * @param {string} refreshToken Refresh Token
 * @returns {number} 过期时间戳（毫秒）
 */
function getRefreshTokenExpiresMs(refreshToken) {
  const decoded = jwt.decode(refreshToken);
  if (decoded && decoded.exp) {
    return decoded.exp * 1000;
  }
  // 兜底：默认 30 天，保持与 jwtConfig.refreshExpires 的默认值一致。
  return Date.now() + 30 * 24 * 60 * 60 * 1000;
}

/**
 * Redis 安全执行包装器
 * Redis 不可用时捕获异常并返回默认值
 * @param {Function} fn 返回 Promise 的 Redis 操作函数
 * @param {*} defaultValue 失败时的默认返回值
 * @returns {Promise<*>} 操作结果或默认值
 */
async function safeRedis(fn, defaultValue) {
  try {
    return await fn();
  } catch (err) {
    logger.warn(`Redis 操作失败（认证服务降级）：${err.message}`);
    return defaultValue;
  }
}

/**
 * 构造设备信息字符串（基于 UA 解析结果）
 * @param {Object} auditContext 审计上下文
 * @returns {string} 设备信息描述
 */
function buildDeviceInfo(auditContext) {
  if (!auditContext) return 'unknown';
  const { uaBrowser, uaOs, uaDevice } = auditContext;
  const parts = [];
  if (uaBrowser) parts.push(uaBrowser);
  if (uaOs) parts.push(uaOs);
  if (uaDevice && uaDevice !== 'desktop') parts.push(uaDevice);
  return parts.join(' / ') || 'unknown';
}

/**
 * 创建 refresh_tokens 记录
 * @param {string} userId 用户 ID
 * @param {string} refreshToken Refresh Token 原文
 * @param {string} deviceInfo 设备信息
 * @returns {Promise<RefreshToken>} 创建的记录
 */
async function createRefreshTokenRecord(userId, refreshToken, deviceInfo) {
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(getRefreshTokenExpiresMs(refreshToken));
  return RefreshToken.create({
    userId,
    tokenHash,
    deviceInfo,
    expiresAt
  });
}

// ============================
// SubTask 4.1: register 注册
// ============================
/**
 * 注册服务
 * 流程：校验入参 → 检查唯一性 → 加密密码 → 创建用户 → 生成验证码 → 发送邮件
 * @param {Object} params 注册参数
 * @param {string} params.email 邮箱
 * @param {string} params.username 用户名
 * @param {string} params.password 密码
 * @param {Object} params.auditContext 审计上下文（含 IP/UA/来源等）
 * @returns {Promise<Object>} { message, resend_available_in }
 */
export async function register({ email, username, password, auditContext }) {
  // 1. 校验入参
  if (!isValidEmail(email)) {
    throw new AuthError(42201, '邮箱格式不正确');
  }
  if (!isValidUsername(username)) {
    throw new AuthError(42201, '用户名需为 3-50 位字母、数字或下划线');
  }
  if (!isValidPassword(password)) {
    throw new AuthError(42201, '密码至少 8 位，且需同时包含字母和数字');
  }

  // 2. 检查邮箱唯一性
  const existingEmail = await User.findByEmail(email);
  if (existingEmail) {
    throw new AuthError(40902, '该邮箱已被注册');
  }

  // 3. 检查用户名唯一性
  const existingUsername = await User.findByUsername(username);
  if (existingUsername) {
    throw new AuthError(40901, '该用户名已被占用');
  }

  // 4. bcrypt 加密密码
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  // 5. 创建用户（status='pending_email'）
  const user = await User.create({
    username,
    email,
    passwordHash,
    status: 'pending_email',
    role: 'user',
    registerIp: auditContext?.ip || null,
    registerUserAgent: auditContext?.userAgent || null,
    registerReferer: auditContext?.referer || null,
    registerSource: auditContext?.source || 'web'
  });

  // 6. 生成 6 位验证码，bcrypt 加密后存入 email_verifications
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_COST);
  const expiresAt = new Date(Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000);
  await EmailVerification.create({
    userId: user.id,
    email,
    code: codeHash,
    purpose: 'register',
    expiresAt,
    requestIp: auditContext?.ip || null,
    requestUserAgent: auditContext?.userAgent || null
  });

  // 7. 调用 EmailService 发送验证码邮件（异步不阻塞，失败仅记录日志）
  EmailService.sendVerificationCode(email, code, 'register').catch((err) => {
    logger.error(`注册验证码邮件发送失败：${err.message}`, { email, userId: user.id });
  });

  // 8. 返回结果
  return {
    message: '验证码已发送至邮箱',
    resend_available_in: 60
  };
}

// ============================
// SubTask 4.1: verifyEmail 邮箱验证
// ============================
/**
 * 邮箱验证服务
 * 流程：查询验证码记录 → 校验尝试次数 → 比对验证码 → 激活账号 → 签发令牌
 * @param {Object} params 验证参数
 * @param {string} params.email 邮箱
 * @param {string} params.code 验证码
 * @param {Object} params.auditContext 审计上下文
 * @returns {Promise<Object>} { accessToken, refreshToken, user }
 */
export async function verifyEmail({ email, code, auditContext }) {
  // 1. 查询最新未消耗的验证码记录
  const verification = await EmailVerification.findLatestByEmail(email, 'register');
  if (!verification) {
    throw new AuthError(40401, '未找到有效的验证码记录，请先获取验证码');
  }

  // 2. 校验是否已过期
  if (new Date(verification.expiresAt) < new Date()) {
    throw new AuthError(42201, '验证码已过期，请重新获取');
  }

  // 3. 校验尝试次数（防爆破）
  if (verification.attempts >= CODE_MAX_ATTEMPTS) {
    throw new AuthError(42902, '验证码尝试次数过多，请重新获取');
  }

  // 4. bcrypt 比对验证码
  const matched = await bcrypt.compare(code, verification.code);
  if (!matched) {
    // 失败则自增尝试次数
    await EmailVerification.incrementAttempts(verification.id);
    throw new AuthError(42201, '验证码不正确');
  }

  // 5. 查询用户
  const user = await User.findByEmail(email);
  if (!user) {
    throw new AuthError(40401, '用户不存在');
  }
  if (user.status !== 'pending_email') {
    throw new AuthError(42201, '该邮箱已验证，无需重复验证');
  }

  // 6. 更新用户状态为 active
  await user.update({
    status: 'active',
    emailVerifiedAt: new Date()
  });

  // 7. 标记验证码记录为已消耗
  await EmailVerification.markConsumed(verification.id);

  const defaultGroup = await UserGroup.findOne({ where: { isDefault: true, isActive: true } });
  if (defaultGroup) {
    await UserGroupMember.findOrCreate({
      where: { userId: user.id, groupId: defaultGroup.id },
      defaults: {
        userId: user.id,
        groupId: defaultGroup.id,
        grantReason: '邮箱验证后加入默认用户组'
      }
    });
    if (!user.userGroupId) {
      await user.update({ userGroupId: defaultGroup.id });
    }
  }

  await CoinService.getOrCreateBalance(user.id);
  if (DEFAULT_NEW_USER_BALANCE > 0) {
    await CoinService.transact({
      userId: user.id,
      type: 'register_gift',
      amount: DEFAULT_NEW_USER_BALANCE,
      operatorType: 'system',
      refType: 'user',
      refId: user.id,
      reasonCode: 'registration.new_user_balance',
      description: '新用户初始金币',
      requestId: auditContext?.requestId || null,
      clientIp: auditContext?.ip || null,
      userAgent: auditContext?.userAgent || null
    });
  }
  if (REGISTER_GIFT_COINS > 0) {
    await CoinService.transact({
      userId: user.id,
      type: 'register_gift',
      amount: REGISTER_GIFT_COINS,
      operatorType: 'system',
      refType: 'user',
      refId: user.id,
      reasonCode: 'registration.gift_coins',
      description: '注册邮箱验证赠送金币',
      requestId: auditContext?.requestId || null,
      clientIp: auditContext?.ip || null,
      userAgent: auditContext?.userAgent || null
    });
  }

  // 8. 生成 JWT（Access + Refresh）
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user.id);
  const deviceInfo = buildDeviceInfo(auditContext);
  await createRefreshTokenRecord(user.id, refreshToken, deviceInfo);

  // 9. 返回令牌与用户信息
  return {
    accessToken,
    refreshToken,
    user: user.toJSON()
  };
}

// ============================
// SubTask 4.1: login 登录
// ============================
/**
 * 登录服务
 * 流程：IP 限频 → 查询用户 → 状态检查 → 账号锁定检查 → 密码校验 → 异地登录检测 → 签发令牌
 * @param {Object} params 登录参数
 * @param {string} params.emailOrUsername 邮箱或用户名
 * @param {string} params.password 密码
 * @param {Object} params.auditContext 审计上下文
 * @returns {Promise<Object>} { accessToken, refreshToken, user }
 */
export async function login({ emailOrUsername, password, auditContext }) {
  const ip = auditContext?.ip || 'unknown';
  const userAgent = auditContext?.userAgent || '';
  const parsedUa = parseUserAgent(userAgent);

  // 1. Redis IP 限频：同 IP 5 分钟内失败超过 20 次 → 拒绝
  const ipFailCount = await safeRedis(() => redis.get(LOGIN_FAIL_IP_KEY(ip)), 0);
  if (parseInt(ipFailCount, 10) >= LOGIN_IP_MAX_FAILURES) {
    throw new AuthError(42903, '该 IP 登录失败次数过多，请稍后再试');
  }

  // 2. 查询用户（by email 或 username）
  const isEmail = emailOrUsername.includes('@');
  const user = isEmail
    ? await User.findByEmail(emailOrUsername)
    : await User.findByUsername(emailOrUsername);

  // 用户不存在：记录 login_logs(fail_reason='NOT_FOUND') 返回 40401
  if (!user) {
    await LoginLog.createLog({
      emailOrUsername,
      status: 'failed',
      failReason: 'NOT_FOUND',
      ip,
      userAgent,
      uaBrowser: parsedUa.browser,
      uaOs: parsedUa.os,
      uaDevice: parsedUa.device,
      uaIsBot: parsedUa.isBot ? 1 : 0
    });
    // IP 失败计数 +1
    await safeRedis(() => redis.incr(LOGIN_FAIL_IP_KEY(ip)), null);
    await safeRedis(() => redis.expire(LOGIN_FAIL_IP_KEY(ip), LOGIN_IP_WINDOW_MINUTES * 60), null);
    throw new AuthError(40401, '账号或密码错误');
  }

  // 3. 用户状态检查
  const statusCheck = checkUserStatusForLogin(user);
  if (statusCheck) {
    // 记录状态异常日志
    await LoginLog.createLog({
      userId: user.id,
      emailOrUsername,
      status: statusCheck.logStatus,
      failReason: statusCheck.failReason,
      ip,
      userAgent,
      uaBrowser: parsedUa.browser,
      uaOs: parsedUa.os,
      uaDevice: parsedUa.device,
      uaIsBot: parsedUa.isBot ? 1 : 0
    });
    throw new AuthError(statusCheck.code, statusCheck.message, statusCheck.extra);
  }

  // 4. Redis 账号失败计数：连续失败 5 次 → 锁定 15 分钟
  const userFailCount = await safeRedis(() => redis.get(LOGIN_FAIL_USER_KEY(user.id)), 0);
  if (parseInt(userFailCount, 10) >= LOGIN_USER_MAX_FAILURES) {
    await LoginLog.createLog({
      userId: user.id,
      emailOrUsername,
      status: 'locked',
      failReason: 'LOCKED',
      ip,
      userAgent,
      uaBrowser: parsedUa.browser,
      uaOs: parsedUa.os,
      uaDevice: parsedUa.device,
      uaIsBot: parsedUa.isBot ? 1 : 0
    });
    throw new AuthError(42902, '账号已被锁定，请 15 分钟后再试');
  }

  // 5. bcrypt 校验密码
  const passwordMatched = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatched) {
    // 失败：记录 login_logs(fail_reason='WRONG_PASSWORD')，自增失败计数
    await LoginLog.createLog({
      userId: user.id,
      emailOrUsername,
      status: 'failed',
      failReason: 'WRONG_PASSWORD',
      ip,
      userAgent,
      uaBrowser: parsedUa.browser,
      uaOs: parsedUa.os,
      uaDevice: parsedUa.device,
      uaIsBot: parsedUa.isBot ? 1 : 0
    });
    // 用户失败计数 +1，并设置 TTL
    const newCount = await safeRedis(() => redis.incr(LOGIN_FAIL_USER_KEY(user.id)), 0);
    if (newCount === 1) {
      await safeRedis(() => redis.expire(LOGIN_FAIL_USER_KEY(user.id), LOGIN_USER_LOCK_MINUTES * 60), null);
    }
    // IP 失败计数 +1
    await safeRedis(() => redis.incr(LOGIN_FAIL_IP_KEY(ip)), null);
    await safeRedis(() => redis.expire(LOGIN_FAIL_IP_KEY(ip), LOGIN_IP_WINDOW_MINUTES * 60), null);
    throw new AuthError(42201, '账号或密码错误');
  }

  // 6. 登录成功：清除失败计数
  await safeRedis(() => redis.del(LOGIN_FAIL_USER_KEY(user.id)), null);

  // 7. 异地/新设备登录检测（对比 last_login_ip，不同则异步发送邮件提醒）
  const lastLoginIp = user.lastLoginIp;
  if (lastLoginIp && lastLoginIp !== ip) {
    // 异步发送异地登录提醒邮件，不阻塞登录流程
    const location = auditContext?.location;
    const locationStr = location ? `${location.country || ''} ${location.region || ''} ${location.city || ''}`.trim() : null;
    EmailService.sendLoginAlert(user.email, ip, locationStr, userAgent, new Date()).catch((err) => {
      logger.error(`异地登录提醒邮件发送失败：${err.message}`, { userId: user.id });
    });
  }

  // 8. 生成 JWT（Access 15min + 长期 Refresh），创建 refresh_tokens 记录
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user.id);
  const deviceInfo = buildDeviceInfo(auditContext);
  const tokenRecord = await createRefreshTokenRecord(user.id, refreshToken, deviceInfo);

  // 9. 记录 login_logs(status='success')，更新 users.last_login_*
  await LoginLog.createLog({
    userId: user.id,
    emailOrUsername,
    loginType: 'password',
    status: 'success',
    ip,
    userAgent,
    uaBrowser: parsedUa.browser,
    uaOs: parsedUa.os,
    uaDevice: parsedUa.device,
    uaIsBot: parsedUa.isBot ? 1 : 0,
    refreshTokenId: tokenRecord.id
  });

  await user.update({
    lastLoginAt: new Date(),
    lastLoginIp: ip,
    lastLoginUserAgent: userAgent
  });

  // 10. 返回令牌与用户信息
  return {
    accessToken,
    refreshToken,
    user: user.toJSON()
  };
}

/**
 * 检查用户登录状态（pending_email/disabled/banned）
 * @param {Object} user 用户实例
 * @returns {Object|null} 状态异常信息，null 表示状态正常
 */
function checkUserStatusForLogin(user) {
  if (user.status === 'pending_email') {
    return {
      code: 40104,
      message: '邮箱未验证，请先完成邮箱验证',
      logStatus: 'pending_email',
      failReason: 'PENDING_EMAIL',
      extra: {}
    };
  }
  if (user.status === 'disabled') {
    return {
      code: 40304,
      message: '账号已被禁用，请联系管理员',
      logStatus: 'disabled',
      failReason: 'DISABLED',
      extra: {}
    };
  }
  if (user.status === 'banned') {
    return {
      code: 40303,
      message: '账号已被封禁',
      logStatus: 'banned',
      failReason: 'BANNED',
      extra: {
        ban_reason: user.banReason || null,
        banned_until: user.bannedUntil || null
      }
    };
  }
  return null;
}

// ============================
// SubTask 4.1: logout 退出
// ============================
/**
 * 退出登录服务
 * 流程：撤销 refresh_tokens → accessToken 加入 Redis 黑名单
 * @param {Object} params 退出参数
 * @param {string} params.refreshToken Refresh Token 原文
 * @param {string} params.accessToken Access Token 原文
 * @param {string} params.userId 用户 ID
 * @returns {Promise<Object>} 退出结果
 */
export async function logout({ refreshToken, accessToken, userId }) {
  // 1. 撤销 refresh_tokens 记录
  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    const tokenRecord = await RefreshToken.findOne({ where: { tokenHash } });
    if (tokenRecord && !tokenRecord.revokedAt) {
      await tokenRecord.update({ revokedAt: new Date() });
    }
  }

  // 2. 将 accessToken 加入 Redis 黑名单（key: blacklist:token:{jti}, TTL=剩余有效期）
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken);
      if (decoded && decoded.jti && decoded.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await safeRedis(() => redis.set(BLACKLIST_TOKEN_KEY(decoded.jti), '1', 'EX', ttl), null);
          rememberBlacklistedToken(decoded.jti, ttl);
        }
      }
    } catch (err) {
      logger.warn(`登出时解析 accessToken 失败：${err.message}`);
    }
  }

  return { message: '已退出登录' };
}

// ============================
// SubTask 4.1: refresh 刷新令牌
// ============================
/**
 * 刷新令牌服务
 * 流程：验证 JWT → 查询 refresh_tokens → 检查用户状态 → 生成新 Access Token（可选轮换 Refresh Token）
 * @param {Object} params 刷新参数
 * @param {string} params.refreshToken Refresh Token 原文
 * @param {Object} params.auditContext 审计上下文
 * @returns {Promise<Object>} { accessToken, refreshToken? }
 */
export async function refresh({ refreshToken, auditContext }) {
  // 1. 验证 refreshToken JWT 签名
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, jwtConfig.secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AuthError(40102, '刷新令牌已过期，请重新登录');
    }
    throw new AuthError(40103, '刷新令牌无效');
  }
  if (decoded?.token_type !== 'refresh') {
    throw new AuthError(40103, '刷新令牌类型不正确');
  }

  // 2. 查询 refresh_tokens 表（token_hash 匹配 + 未过期 + 未撤销）
  const tokenHash = hashToken(refreshToken);
  const tokenRecord = await RefreshToken.findValidByHash(tokenHash);
  if (!tokenRecord) {
    throw new AuthError(40103, '刷新令牌不存在或已失效');
  }

  // 3. 查询用户并检查状态
  const user = await User.findByPk(tokenRecord.userId);
  if (!user) {
    throw new AuthError(40101, '用户不存在');
  }
  if (user.status === 'banned') {
    throw new AuthError(40303, '账号已被封禁', {
      ban_reason: user.banReason || null,
      banned_until: user.bannedUntil || null
    });
  }
  if (user.status === 'disabled') {
    throw new AuthError(40304, '账号已被禁用');
  }

  // 4. 生成新的 Access Token
  const accessToken = signAccessToken(user);

  // 5. 可选：轮换 Refresh Token（撤销旧的，签发新的）
  // 此处采用轮换策略，提升安全性
  await tokenRecord.update({ revokedAt: new Date() });
  const newRefreshToken = signRefreshToken(user.id);
  const deviceInfo = tokenRecord.deviceInfo || buildDeviceInfo(auditContext);
  await createRefreshTokenRecord(user.id, newRefreshToken, deviceInfo);

  // 6. 返回新令牌
  return {
    accessToken,
    refreshToken: newRefreshToken
  };
}

// ============================
// SubTask 4.1: forgotPassword 忘记密码
// ============================
/**
 * 忘记密码服务
 * 流程：查询用户（不存在也返回成功，防止枚举）→ 生成验证码 → 发送重置密码邮件
 * @param {Object} params 参数
 * @param {string} params.email 邮箱
 * @param {Object} params.auditContext 审计上下文
 * @returns {Promise<Object>} { message }
 */
export async function forgotPassword({ email, auditContext }) {
  // 1. 查询用户是否存在
  const user = await User.findByEmail(email);

  // 用户不存在也返回成功，防止邮箱枚举攻击
  if (!user) {
    return { message: '重置验证码已发送' };
  }

  // 2. 生成验证码，存入 email_verifications（purpose='reset_password'）
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_COST);
  const expiresAt = new Date(Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000);
  await EmailVerification.create({
    userId: user.id,
    email,
    code: codeHash,
    purpose: 'reset_password',
    expiresAt,
    requestIp: auditContext?.ip || null,
    requestUserAgent: auditContext?.userAgent || null
  });

  // 3. 发送重置密码邮件（节流与限频由 EmailService 内部处理）
  const result = await EmailService.sendVerificationCode(email, code, 'reset_password');
  if (!result.sent) {
    // 节流/限频触发时返回具体原因
    if (result.reason) {
      throw new AuthError(42901, result.reason);
    }
    // SMTP 不可用时不阻塞，验证码已在日志中记录
    logger.warn(`重置密码邮件发送失败（SMTP 不可用），邮箱：${email}`);
  }

  // 4. 返回成功
  return { message: '重置验证码已发送' };
}

// ============================
// SubTask 4.1: resetPassword 重置密码
// ============================
/**
 * 重置密码服务
 * 流程：校验验证码 → 加密新密码 → 更新 password_hash → 撤销所有 refresh_tokens
 * @param {Object} params 重置参数
 * @param {string} params.email 邮箱
 * @param {string} params.code 验证码
 * @param {string} params.newPassword 新密码
 * @param {Object} params.auditContext 审计上下文
 * @returns {Promise<Object>} 重置结果
 */
export async function resetPassword({ email, code, newPassword, auditContext }) {
  // 1. 校验密码强度
  if (!isValidPassword(newPassword)) {
    throw new AuthError(42201, '密码至少 8 位，且需同时包含字母和数字');
  }

  // 2. 校验验证码（purpose='reset_password'）
  const verification = await EmailVerification.findLatestByEmail(email, 'reset_password');
  if (!verification) {
    throw new AuthError(40401, '未找到有效的验证码记录，请先获取验证码');
  }
  if (new Date(verification.expiresAt) < new Date()) {
    throw new AuthError(42201, '验证码已过期，请重新获取');
  }
  if (verification.attempts >= CODE_MAX_ATTEMPTS) {
    throw new AuthError(42902, '验证码尝试次数过多，请重新获取');
  }

  // bcrypt 比对验证码
  const matched = await bcrypt.compare(code, verification.code);
  if (!matched) {
    await EmailVerification.incrementAttempts(verification.id);
    throw new AuthError(42201, '验证码不正确');
  }

  // 3. 查询用户
  const user = await User.findByEmail(email);
  if (!user) {
    throw new AuthError(40401, '用户不存在');
  }

  // 4. bcrypt 加密新密码，更新 password_hash
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await user.update({ passwordHash });

  // 5. 标记验证码已消耗
  await EmailVerification.markConsumed(verification.id);

  // 6. 撤销该用户所有 refresh_tokens
  await RefreshToken.revokeByUserId(user.id);

  return { message: '密码重置成功，请使用新密码登录' };
}

// ============================
// SubTask 4.1: changePassword 修改密码
// ============================
/**
 * 修改密码服务
 * 流程：校验旧密码 → 加密新密码 → 更新 password_hash → 撤销除当前会话外的所有 refresh_tokens
 * @param {Object} params 修改参数
 * @param {string} params.userId 用户 ID
 * @param {string} params.oldPassword 旧密码
 * @param {string} params.newPassword 新密码
 * @param {string} [params.currentSessionId] 当前会话 ID（保留不撤销）
 * @param {Object} params.auditContext 审计上下文
 * @returns {Promise<Object>} 修改结果
 */
export async function changePassword({ userId, oldPassword, newPassword, currentSessionId, auditContext }) {
  // 1. 校验新密码强度
  if (!isValidPassword(newPassword)) {
    throw new AuthError(42201, '新密码至少 8 位，且需同时包含字母和数字');
  }

  // 2. 查询用户，bcrypt 校验旧密码
  const user = await User.findByPk(userId);
  if (!user) {
    throw new AuthError(40401, '用户不存在');
  }
  const oldPasswordMatched = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!oldPasswordMatched) {
    throw new AuthError(42201, '原密码不正确');
  }

  // 新旧密码不能相同
  if (oldPassword === newPassword) {
    throw new AuthError(42201, '新密码不能与原密码相同');
  }

  // 3. bcrypt 加密新密码，更新 password_hash
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await user.update({ passwordHash });

  // 4. 撤销除当前会话外的所有 refresh_tokens
  await RefreshToken.revokeByUserId(userId, currentSessionId);

  return { message: '密码修改成功' };
}

// ============================
// SubTask 4.1: getProfile 获取用户信息
// ============================
/**
 * 获取用户信息（不含 password_hash）
 * @param {Object} params 参数
 * @param {string} params.userId 用户 ID
 * @returns {Promise<Object>} 用户信息
 */
export async function getProfile({ userId }) {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new AuthError(40401, '用户不存在');
  }

  const userProfile = user.toJSON();
  const [balance, userGroups] = await Promise.all([
    CoinService.getBalance(userId),
    UserGroupMember.findAll({
      where: {
        userId,
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: new Date() } }
        ]
      },
      include: [{ model: UserGroup, as: 'group' }],
      order: [
        [{ model: UserGroup, as: 'group' }, 'priority', 'DESC'],
        ['joinedAt', 'DESC']
      ]
    })
  ]);
  userProfile.balance = balance;
  userProfile.userGroups = userGroups.map((item) => item.group).filter(Boolean);

  return userProfile;
}

// ============================
// SubTask 4.1: getSessions 获取会话列表
// ============================
/**
 * 获取用户所有有效 refresh_tokens 列表
 * @param {Object} params 参数
 * @param {string} params.userId 用户 ID
 * @returns {Promise<Array>} 会话列表
 */
export async function getSessions({ userId }) {
  const sessions = await RefreshToken.findAll({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { [Op.gt]: new Date() }
    },
    order: [['createdAt', 'DESC']],
    attributes: ['id', 'deviceInfo', 'createdAt', 'expiresAt']
  });

  // 转换字段名为驼峰，并补充 last_login_at（用 created_at 近似）
  return sessions.map((s) => ({
    id: s.id,
    device_info: s.deviceInfo,
    created_at: s.createdAt,
    expires_at: s.expiresAt,
    last_login_at: s.createdAt
  }));
}

// ============================
// SubTask 4.1: revokeSession 注销会话
// ============================
/**
 * 撤销指定 refresh_token
 * @param {Object} params 参数
 * @param {string} params.userId 用户 ID
 * @param {string} params.sessionId 会话 ID（refresh_token.id）
 * @returns {Promise<Object>} 撤销结果
 */
export async function revokeSession({ userId, sessionId }) {
  // 查询令牌记录，确保属于当前用户
  const tokenRecord = await RefreshToken.findOne({
    where: { id: sessionId, userId }
  });
  if (!tokenRecord) {
    throw new AuthError(40401, '会话不存在');
  }
  if (tokenRecord.revokedAt) {
    throw new AuthError(42201, '该会话已被撤销');
  }

  await tokenRecord.update({ revokedAt: new Date() });
  return { message: '会话已注销' };
}

// ============================
// SubTask 4.1: getLoginLogs 获取登录记录
// ============================
/**
 * 分页返回用户登录记录
 * @param {Object} params 参数
 * @param {string} params.userId 用户 ID
 * @param {number} [params.page=1] 页码
 * @param {number} [params.pageSize=20] 每页条数
 * @returns {Promise<Object>} 分页结果 { items, total, page, pageSize, totalPages }
 */
export async function getLoginLogs({ userId, page = 1, pageSize = 20 }) {
  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;

  const { rows, count } = await LoginLog.findAndCountAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    attributes: ['id', 'status', 'failReason', 'ip', 'ipCountry', 'ipRegion', 'ipCity', 'userAgent', 'uaBrowser', 'uaOs', 'uaDevice', 'createdAt']
  });

  return {
    items: rows,
    total: count,
    page: Math.max(parseInt(page, 10) || 1, 1),
    pageSize: limit,
    totalPages: Math.ceil(count / limit)
  };
}

// ============================
// SubTask 4.1: checkEmail 检查邮箱
// ============================
/**
 * 检查邮箱是否已注册
 * @param {Object} params 参数
 * @param {string} params.email 邮箱
 * @returns {Promise<Object>} { exists: boolean }
 */
export async function checkEmail({ email }) {
  if (!isValidEmail(email)) {
    throw new AuthError(42201, '邮箱格式不正确');
  }
  const user = await User.findByEmail(email);
  return { exists: !!user };
}

// ============================
// SubTask 4.1: resendVerification 重发验证码
// ============================
/**
 * 重发注册验证码
 * 流程：查询用户 → 检查状态 → 生成新验证码 → 发送邮件
 * @param {Object} params 参数
 * @param {string} params.email 邮箱
 * @param {Object} params.auditContext 审计上下文
 * @returns {Promise<Object>} { message, resend_available_in }
 */
export async function resendVerification({ email, auditContext }) {
  // 1. 查询用户
  const user = await User.findByEmail(email);
  if (!user) {
    // 防止枚举，返回成功
    return { message: '验证码已发送', resend_available_in: 60 };
  }

  // 2. 检查状态：已激活则无需重发
  if (user.status === 'active') {
    throw new AuthError(42201, '该邮箱已验证，无需重发验证码');
  }

  // 3. 生成新验证码，存入 email_verifications
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_COST);
  const expiresAt = new Date(Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000);
  await EmailVerification.create({
    userId: user.id,
    email,
    code: codeHash,
    purpose: 'register',
    expiresAt,
    requestIp: auditContext?.ip || null,
    requestUserAgent: auditContext?.userAgent || null
  });

  // 4. 发送验证码邮件（节流与限频由 EmailService 内部处理）
  const result = await EmailService.sendVerificationCode(email, code, 'register');
  if (!result.sent && result.reason) {
    throw new AuthError(42901, result.reason);
  }

  return { message: '验证码已发送', resend_available_in: 60 };
}

// ============================
// 换绑邮箱（POST /api/auth/change-email）
// ============================
/**
 * 换绑邮箱（预留接口，需用户已登录）
 * 流程：校验新邮箱 → 检查唯一性 → 生成验证码 → 发送邮件
 * 注：完整换绑流程需二次验证（旧邮箱确认 + 新邮箱验证），此处仅实现发送验证码到新邮箱
 * @param {Object} params 参数
 * @param {string} params.userId 用户 ID
 * @param {string} params.newEmail 新邮箱
 * @param {Object} params.auditContext 审计上下文
 * @returns {Promise<Object>} { message }
 */
export async function changeEmail({ userId, newEmail, auditContext }) {
  // 1. 校验新邮箱格式
  if (!isValidEmail(newEmail)) {
    throw new AuthError(42201, '新邮箱格式不正确');
  }

  // 2. 查询用户
  const user = await User.findByPk(userId);
  if (!user) {
    throw new AuthError(40401, '用户不存在');
  }

  // 3. 检查新邮箱唯一性
  if (user.email === newEmail) {
    throw new AuthError(42201, '新邮箱不能与当前邮箱相同');
  }
  const existingUser = await User.findByEmail(newEmail);
  if (existingUser) {
    throw new AuthError(40902, '该邮箱已被其他账号使用');
  }

  // 4. 生成验证码，存入 email_verifications（purpose='change_email'）
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_COST);
  const expiresAt = new Date(Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000);
  await EmailVerification.create({
    userId: user.id,
    email: newEmail,
    code: codeHash,
    purpose: 'change_email',
    expiresAt,
    requestIp: auditContext?.ip || null,
    requestUserAgent: auditContext?.userAgent || null
  });

  // 5. 发送验证码邮件
  const result = await EmailService.sendVerificationCode(newEmail, code, 'change_email');
  if (!result.sent && result.reason) {
    throw new AuthError(42901, result.reason);
  }

  // TODO: 后续需实现验证新邮箱后更新 users.email 字段的接口
  return { message: '换绑邮箱验证码已发送至新邮箱' };
}

export default {
  AuthError,
  register,
  verifyEmail,
  login,
  logout,
  refresh,
  forgotPassword,
  resetPassword,
  changePassword,
  getProfile,
  getSessions,
  revokeSession,
  getLoginLogs,
  checkEmail,
  resendVerification,
  changeEmail
};
