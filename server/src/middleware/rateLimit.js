// -*- coding: utf-8 -*-
/**
 * 速率限制中间件（基于 Redis 滑动窗口）
 * - rateLimit.global：API 全局限流（默认 600 次/min，可配 RATE_LIMIT_GLOBAL）
 * - rateLimit.create({ windowMs, max, keyGenerator })：创建自定义限流器
 *
 * 实现：使用 Redis Sorted Set（ZSET）记录窗口内每次请求的时间戳，
 *       清除过期成员后统计当前窗口请求数，实现精确滑动窗口。
 *
 * 响应头：
 * - X-RateLimit-Remaining：当前窗口剩余可用次数
 * - X-RateLimit-Reset：窗口重置时间（Unix 秒）
 * - Retry-After：触发限流时建议的重试等待秒数
 *
 * 降级策略：Redis 不可用时自动放行（仅记录警告日志），保证服务可用性
 */
import { redis } from '../config/redis.js';
import { error } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { getClientIp } from '../utils/ip-ua.js';

const localBuckets = new Map();

function cleanupLocalBuckets(now) {
  if (localBuckets.size < 1000) return;
  for (const [key, bucket] of localBuckets.entries()) {
    if (bucket.expiresAt <= now) localBuckets.delete(key);
  }
}

function applyLocalRateLimit(req, res, next, config, identifier) {
  const { key, max, windowMs } = config;
  const redisKey = `${key}:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowMs;
  const bucket = localBuckets.get(redisKey) || { timestamps: [], expiresAt: now + windowMs };
  bucket.timestamps = bucket.timestamps.filter((item) => item > windowStart);
  bucket.timestamps.push(now);
  bucket.expiresAt = now + windowMs;
  localBuckets.set(redisKey, bucket);
  cleanupLocalBuckets(now);

  const remaining = Math.max(0, max - bucket.timestamps.length);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));

  if (bucket.timestamps.length > max) {
    res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
    return error(res, 42901, '请求过于频繁，请稍后再试', 429);
  }

  return next();
}

/**
 * 执行滑动窗口速率限制检查
 * 使用 ZSET 记录窗口内请求时间戳，清除过期成员后统计数量
 * @param {Object} req Express 请求对象
 * @param {Object} res Express 响应对象
 * @param {Function} next 下一个中间件
 * @param {Object} config 限流配置
 * @param {string} config.key Redis key 前缀
 * @param {number} config.max 窗口内最大请求数
 * @param {number} config.windowMs 窗口大小（毫秒）
 * @param {Function} [config.keyGenerator] 标识符生成函数，默认使用 IP
 */
async function applyRateLimit(req, res, next, config) {
  const { key, max, windowMs, keyGenerator } = config;
  // 标识符：默认使用 IP，可自定义（如 userId）
  const identifier = keyGenerator ? keyGenerator(req) : getClientIp(req);
  const redisKey = `${key}:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    // 使用 pipeline 批量执行，减少网络往返
    const pipeline = redis.pipeline();
    // 清除窗口外的过期成员
    pipeline.zremrangebyscore(redisKey, 0, windowStart);
    // 添加当前请求（member 用 唯一值避免同毫秒去重）
    pipeline.zadd(redisKey, now, `${now}:${Math.random().toString(36).slice(2, 10)}`);
    // 设置 key 过期时间（窗口大小 + 缓冲），避免冷数据残留
    pipeline.pexpire(redisKey, windowMs + 1000);
    // 统计当前窗口内请求数
    pipeline.zcard(redisKey);
    const results = await pipeline.exec();
    // zcard 结果在 pipeline 第 4 个位置（索引 3），结果格式为 [error, value]
    const count = results[3][1];

    // 计算剩余次数与重置时间
    const remaining = Math.max(0, max - count);
    const resetAt = Math.ceil((now + windowMs) / 1000);

    // 设置标准限流响应头
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetAt);

    // 触发限流
    if (count > max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return error(res, 42901, '请求过于频繁，请稍后再试', 429);
    }
    next();
  } catch (err) {
    logger.warn(`速率限制检查失败（Redis 不可用，使用本地限流兜底）：${err.message}`);
    return applyLocalRateLimit(req, res, next, config, identifier);
  }
}

/**
 * 创建自定义速率限制中间件
 * @param {Object} options 限流配置
 * @param {number} [options.windowMs=60000] 窗口大小（毫秒），默认 60 秒
 * @param {number} [options.max=100] 窗口内最大请求数
 * @param {string} [options.key='rate_limit'] Redis key 前缀
 * @param {Function} [options.keyGenerator] 标识符生成函数，默认使用 IP；可自定义（如 req => req.userId）
 * @returns {Function} Express 中间件
 */
export function create(options = {}) {
  const {
    windowMs = 60000,
    max = 100,
    key = 'rate_limit',
    keyGenerator
  } = options;
  return (req, res, next) => {
    applyRateLimit(req, res, next, { key, max, windowMs, keyGenerator });
  };
}

/**
 * 全局速率限制中间件（rateLimit.global）
 * 基于 IP 维度，每分钟请求数上限由 RATE_LIMIT_GLOBAL 环境变量控制（默认 100）
 */
const globalLimiter = create({
  key: 'rate_limit:global:v2',
  max: parseInt(process.env.RATE_LIMIT_GLOBAL || '600', 10),
  windowMs: 60 * 1000
});

/**
 * 速率限制中间件集合
 * - global：全局限流
 * - create：创建自定义限流器
 */
export const rateLimit = {
  global: globalLimiter,
  create
};

// 向后兼容的命名导出（供 app.js 引用）
export { globalLimiter as globalRateLimitMiddleware };

export default rateLimit;
