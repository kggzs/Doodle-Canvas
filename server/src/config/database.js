// -*- coding: utf-8 -*-
/**
 * MySQL + Sequelize 数据库配置
 * 从环境变量读取连接参数，统一 utf8mb4 字符集与 +08:00 时区
 */
import { Sequelize } from 'sequelize';
import { logger } from '../utils/logger.js';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * 创建 Sequelize 实例
 * - 字符集 utf8mb4 / 排序规则 utf8mb4_unicode_ci
 * - 时区 +08:00（东八区）
 * - 连接池：max 10, min 0, acquire 30000ms, idle 10000ms
 * - 日志：开发环境输出全部 SQL，生产环境仅输出 error
 */
export const sequelize = new Sequelize(
  process.env.DB_NAME || 'doodle_canvas',
  process.env.DB_USER || 'root',
  process.env.DB_PASS || '',
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    dialect: 'mysql',
    timezone: '+08:00',
    define: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      underscored: true,
      freezeTableName: true
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    logging: (msg) => {
      // 生产环境仅记录 error 级别 SQL
      if (!isDev) return;
      logger.debug(msg);
    },
    logQueryParameters: isDev
  }
);

/**
 * 测试数据库连接
 * 连接失败仅输出警告日志，不抛出异常（保证服务可启动）
 * @returns {Promise<boolean>} 是否连接成功
 */
export async function testConnection() {
  try {
    await sequelize.authenticate();
    logger.info('MySQL 数据库连接成功');
    return true;
  } catch (err) {
    logger.warn(`MySQL 数据库连接失败：${err.message}（服务仍将启动，相关功能暂不可用）`);
    return false;
  }
}

export default sequelize;
