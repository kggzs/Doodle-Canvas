// -*- coding: utf-8 -*-
/**
 * Redis 连接配置（基于 ioredis）
 * 从环境变量读取连接参数，支持密码认证与自动重连
 */
import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

/**
 * 创建 Redis 客户端
 * @param {Object} [options] 额外 ioredis 配置，将覆盖默认配置
 * @returns {Redis} Redis 客户端实例
 */
export function createRedisClient(options = {}) {
  const client = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASS || undefined,
    retryStrategy: (times) => {
      // 每秒重试一次，最多 10 次
      if (times > 10) {
        logger.warn('Redis 重连次数已达上限（10 次），停止重连');
        return null;
      }
      return Math.min(times * 1000, 1000);
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    ...options
  });

  client.on('connect', () => {
    logger.info('Redis 连接成功');
  });

  client.on('error', (err) => {
    // 连接错误仅输出警告，不抛出异常（保证服务可启动）
    logger.warn(`Redis 连接错误：${err.message}（相关功能暂不可用）`);
  });

  client.on('reconnecting', (delay) => {
    logger.info(`Redis 正在重连，${delay}ms 后重试`);
  });

  return client;
}

/**
 * 默认 Redis 客户端（全局共享）
 * 用于限流、缓存、黑名单等场景
 */
export const redis = createRedisClient();

/**
 * 测试 Redis 连接
 * 连接失败仅输出警告日志，不抛出异常
 * @returns {Promise<boolean>} 是否连接成功
 */
export async function testConnection() {
  try {
    const result = await redis.ping();
    if (result === 'PONG') {
      logger.info('Redis 连接测试通过');
      return true;
    }
    logger.warn(`Redis PING 返回异常：${result}`);
    return false;
  } catch (err) {
    logger.warn(`Redis 连接测试失败：${err.message}（服务仍将启动）`);
    return false;
  }
}

export default redis;
