// -*- coding: utf-8 -*-
/**
 * 日志工具（基于 winston）
 * - 支持 LOG_LEVEL 环境变量控制输出级别
 * - 控制台输出 + 文件输出（error.log 与 combined.log）
 * - 日志格式：时间戳 + 级别 + 消息 + request_id（如有）
 */
import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

// 当前模块路径（ES Modules 下替代 __dirname）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// logs 目录位于项目根目录下
const logsDir = path.join(__dirname, '../../logs');

/**
 * 自定义日志格式
 * - 时间戳 ISO 格式
 * - 级别大写
 * - 自动附加 request_id（从 winston 的 defaultMeta 或 info 对象读取）
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format((info) => {
    // 注入 request_id（如有）
    if (info.requestId && !info.request_id) {
      info.request_id = info.requestId;
      delete info.requestId;
    }
    return info;
  })(),
  winston.format.json()
);

/**
 * 控制台输出格式（彩色，便于开发调试）
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.printf((info) => {
    const { timestamp, level, message, request_id, stack, ...meta } = info;
    const rid = request_id ? ` [${request_id}]` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const stackStr = stack ? `\n${stack}` : '';
    return `${timestamp} ${level}${rid}: ${message}${metaStr}${stackStr}`;
  })
);

/**
 * 创建 winston logger 实例
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'doodle-canvas-server' },
  transports: [
    // 错误日志单独写入 error.log
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    // 全量日志写入 combined.log
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ]
});

// 非生产环境额外输出到控制台
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat
    })
  );
} else {
  // 生产环境也输出到控制台（PM2 会捕获 stdout）
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.printf((info) => {
          const { timestamp, level, message, request_id } = info;
          const rid = request_id ? ` [${request_id}]` : '';
          return `${timestamp} ${level}${rid}: ${message}`;
        })
      )
    })
  );
}

/**
 * 创建带 request_id 的子 logger
 * @param {string} requestId 请求追踪 ID
 * @returns {winston.Logger} 携带 request_id 的 logger
 */
export function createRequestLogger(requestId) {
  return logger.child({ request_id: requestId });
}

export default logger;
