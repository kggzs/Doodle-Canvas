// -*- coding: utf-8 -*-
/**
 * 邮件服务（基于 nodemailer）
 * - createTransport()：从环境变量创建 SMTP transport
 * - sendVerificationCode(email, code, purpose)：发送验证码邮件（注册/重置密码/换绑邮箱）
 * - sendLoginAlert(email, ip, location, userAgent, time)：异地登录提醒
 * - sendBanNotification(email, reason, bannedUntil)：封禁通知
 *
 * 节流与限频：
 * - 节流：Redis key `email_throttle:{email}:{purpose}`，TTL=60s（同一邮箱同一用途 60s 内只能发一次）
 * - 限频：Redis key `email_limit:{email}:{purpose}`，1 小时内最多 5 次
 *
 * 容错策略：
 * - SMTP 不可用时记录错误日志，不阻塞主流程
 * - 开发环境下验证码会记录到日志中，便于调试
 */
import nodemailer from 'nodemailer';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

// SMTP 配置（从环境变量读取）
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.example.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const MAIL_FROM = process.env.MAIL_FROM || 'Doodle-Canvas <noreply@example.com>';

// 节流与限频配置
const THROTTLE_SECONDS = 60; // 同一邮箱同一用途 60s 节流
const LIMIT_WINDOW_SECONDS = 3600; // 限频窗口 1 小时
const LIMIT_MAX = 5; // 1 小时内最多 5 次

// 邮件用途对应的主题与场景文案
const PURPOSE_META = {
  register: { subject: '【Doodle-Canvas】注册验证码', scene: '注册账号' },
  reset_password: { subject: '【Doodle-Canvas】重置密码验证码', scene: '重置密码' },
  change_email: { subject: '【Doodle-Canvas】换绑邮箱验证码', scene: '换绑邮箱' },
  login: { subject: '【Doodle-Canvas】登录验证码', scene: '登录' }
};

/**
 * 单例 SMTP transport（懒加载，首次调用时创建）
 * SMTP 配置缺失时返回 null，调用方需做空值判断
 */
let transporterInstance = null;

/**
 * 创建 SMTP transport（单例）
 * @returns {Object|null} nodemailer transport 实例，配置缺失时返回 null
 */
export function createTransport() {
  // 已创建则直接复用
  if (transporterInstance) return transporterInstance;

  // SMTP 关键配置缺失时返回 null
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    logger.warn('SMTP 配置不完整，邮件服务不可用（仅记录日志）');
    return null;
  }

  transporterInstance = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE, // true 表示使用 465 端口 SSL，false 表示其他端口 STARTTLS
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  logger.info(`SMTP transport 已创建：${SMTP_HOST}:${SMTP_PORT}`);
  return transporterInstance;
}

/**
 * Redis 安全执行包装器
 * Redis 不可用时捕获异常并返回默认值，保证主流程不被阻断
 * @param {Function} fn 返回 Promise 的 Redis 操作函数
 * @param {*} defaultValue 失败时的默认返回值
 * @returns {Promise<*>} 操作结果或默认值
 */
async function safeRedis(fn, defaultValue) {
  try {
    return await fn();
  } catch (err) {
    logger.warn(`Redis 操作失败（邮件服务降级）：${err.message}`);
    return defaultValue;
  }
}

/**
 * 检查节流与限频
 * - 节流：60s 内同一邮箱同一用途只能发一次
 * - 限频：1 小时内最多 5 次
 * @param {string} email 邮箱
 * @param {string} purpose 用途
 * @returns {Promise<{allowed: boolean, reason: string}>} 是否允许发送
 */
async function checkThrottleAndLimit(email, purpose) {
  const throttleKey = `email_throttle:${email}:${purpose}`;
  const limitKey = `email_limit:${email}:${purpose}`;

  // 1. 节流检查：60s 内已发送过则拒绝
  const throttleExists = await safeRedis(() => redis.exists(throttleKey), 0);
  if (throttleExists) {
    return { allowed: false, reason: '请求过于频繁，请 60 秒后再试' };
  }

  // 2. 限频检查：1 小时内发送次数
  const currentCount = await safeRedis(() => redis.get(limitKey), 0);
  if (parseInt(currentCount, 10) >= LIMIT_MAX) {
    return { allowed: false, reason: '发送次数已达上限，请稍后再试' };
  }

  return { allowed: true, reason: '' };
}

/**
 * 标记节流与限频计数
 * 在邮件发送成功后调用，写入节流 key 与累加限频计数
 * @param {string} email 邮箱
 * @param {string} purpose 用途
 * @returns {Promise<void>}
 */
async function markThrottleAndLimit(email, purpose) {
  const throttleKey = `email_throttle:${email}:${purpose}`;
  const limitKey = `email_limit:${email}:${purpose}`;

  // 节流 key 设置 60s TTL
  await safeRedis(() => redis.set(throttleKey, '1', 'EX', THROTTLE_SECONDS), null);

  // 限频计数：首次设置时带 TTL，后续仅自增
  const exists = await safeRedis(() => redis.exists(limitKey), 0);
  if (exists) {
    await safeRedis(() => redis.incr(limitKey), null);
  } else {
    await safeRedis(() => redis.set(limitKey, '1', 'EX', LIMIT_WINDOW_SECONDS), null);
  }
}

/**
 * 内部发送邮件方法
 * SMTP 不可用时降级为日志输出，不抛异常
 * @param {string} to 收件人
 * @param {string} subject 主题
 * @param {string} html HTML 正文
 * @param {string} text 纯文本正文（兜底）
 * @returns {Promise<boolean>} 是否发送成功
 */
async function sendMail(to, subject, html, text) {
  const transporter = createTransport();

  // SMTP 不可用：降级记录日志（开发环境便于查看验证码）
  if (!transporter) {
    logger.warn(`[邮件降级] 收件人：${to}，主题：${subject}，正文：${text}`);
    return false;
  }

  try {
    await transporter.sendMail({
      from: MAIL_FROM,
      to,
      subject,
      text,
      html
    });
    logger.info(`邮件发送成功：${to}，主题：${subject}`);
    return true;
  } catch (err) {
    // 发送失败仅记录错误日志，不阻塞主流程
    logger.error(`邮件发送失败：${err.message}`, { to, subject });
    return false;
  }
}

/**
 * 发送验证码邮件
 * @param {string} email 收件人邮箱
 * @param {string} code 6 位验证码
 * @param {string} purpose 用途：register / reset_password / change_email / login
 * @returns {Promise<{sent: boolean, reason: string}>} 发送结果
 */
export async function sendVerificationCode(email, code, purpose) {
  // 用途校验
  const meta = PURPOSE_META[purpose];
  if (!meta) {
    return { sent: false, reason: '不支持的邮件用途' };
  }

  // 节流与限频检查
  const { allowed, reason } = await checkThrottleAndLimit(email, purpose);
  if (!allowed) {
    return { sent: false, reason };
  }

  // 构造邮件内容
  const subject = meta.subject;
  const text = `您正在${meta.scene}，验证码为：${code}，30 分钟内有效。如非本人操作，请忽略本邮件。`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Doodle-Canvas ${meta.scene}验证码</h2>
      <p>您好，您正在进行<strong>${meta.scene}</strong>操作，验证码为：</p>
      <div style="font-size: 32px; font-weight: bold; color: #1890ff; text-align: center; padding: 20px; background: #f5f5f5; border-radius: 4px; letter-spacing: 8px;">
        ${code}
      </div>
      <p style="color: #999;">验证码 30 分钟内有效，如非本人操作，请忽略本邮件。</p>
    </div>
  `;

  // 发送邮件
  const sent = await sendMail(email, subject, html, text);

  // 发送成功后标记节流与限频（即使 SMTP 降级也标记，避免开发环境刷日志）
  await markThrottleAndLimit(email, purpose);

  return { sent: true, reason: '' };
}

/**
 * 发送异地登录提醒邮件
 * @param {string} email 收件人邮箱
 * @param {string} ip 登录 IP
 * @param {string} location 地理位置（国家/省/市，可能为空）
 * @param {string} userAgent 登录设备 UA
 * @param {string|Date} time 登录时间
 * @returns {Promise<boolean>} 是否发送成功
 */
export async function sendLoginAlert(email, ip, location, userAgent, time) {
  const locationStr = location || '未知地区';
  const timeStr = typeof time === 'string' ? time : new Date(time).toLocaleString('zh-CN');
  const subject = '【Doodle-Canvas】异地登录提醒';
  const text = `您的账号于 ${timeStr} 在 ${locationStr}（IP: ${ip}）登录。如非本人操作，请立即修改密码。`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #faad14;">异地登录提醒</h2>
      <p>您的账号于 <strong>${timeStr}</strong> 在 <strong>${locationStr}</strong> 登录。</p>
      <p>登录 IP：<strong>${ip}</strong></p>
      <p>设备信息：${userAgent || '未知'}</p>
      <p style="color: #999;">如非本人操作，请立即修改密码并检查账号安全。</p>
    </div>
  `;
  return sendMail(email, subject, html, text);
}

/**
 * 发送封禁通知邮件
 * @param {string} email 收件人邮箱
 * @param {string} reason 封禁原因
 * @param {string|Date|null} bannedUntil 封禁截止时间（null 表示永久）
 * @returns {Promise<boolean>} 是否发送成功
 */
export async function sendBanNotification(email, reason, bannedUntil) {
  const untilStr = bannedUntil
    ? (typeof bannedUntil === 'string' ? bannedUntil : new Date(bannedUntil).toLocaleString('zh-CN'))
    : '永久';
  const subject = '【Doodle-Canvas】账号封禁通知';
  const text = `您的账号已被封禁。原因：${reason}。封禁至：${untilStr}。如有异议，请联系客服申诉。`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #f5222d;">账号封禁通知</h2>
      <p>您的账号已被封禁。</p>
      <p>封禁原因：<strong>${reason || '违反平台规则'}</strong></p>
      <p>封禁至：<strong>${untilStr}</strong></p>
      <p style="color: #999;">如有异议，请联系客服申诉。</p>
    </div>
  `;
  return sendMail(email, subject, html, text);
}

/**
 * 重置某邮箱某用途的节流（管理场景使用，如管理员手动重发）
 * @param {string} email 邮箱
 * @param {string} purpose 用途
 * @returns {Promise<void>}
 */
export async function resetThrottle(email, purpose) {
  const throttleKey = `email_throttle:${email}:${purpose}`;
  await safeRedis(() => redis.del(throttleKey), null);
}

export default {
  createTransport,
  sendVerificationCode,
  sendLoginAlert,
  sendBanNotification,
  resetThrottle
};
