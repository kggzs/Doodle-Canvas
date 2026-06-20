// -*- coding: utf-8 -*-
/**
 * Express 应用入口
 * - 加载环境变量
 * - 创建 Express 应用并挂载中间件
 * - 挂载路由（/api/auth、/api/admin、/api/health）
 * - 404 处理与统一错误处理
 * - 启动时测试 MySQL 与 Redis 连接（失败不崩溃）
 */
import 'dotenv/config';
import { runtimeEnv } from './config/runtime-env.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { logger } from './utils/logger.js';
import { success, error } from './utils/response.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { auditContextMiddleware } from './middleware/audit-context.js';
import { globalRateLimitMiddleware } from './middleware/rateLimit.js';
import routes from './routes/index.js';
import { getPublicFileByStoragePath, StorageError } from './services/storage.js';
import { testConnection as testMysql } from './config/database.js';
import { testConnection as testRedis } from './config/redis.js';
import { recordError } from './services/error-logs.js';

// 当前模块路径（ES Modules 下替代 __dirname）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_BASE = process.env.FRONTEND_BASE || '/';
const FRONTEND_DIST_DIR = process.env.FRONTEND_DIST_DIR || '../../dist';
const SERVE_FRONTEND = process.env.SERVE_FRONTEND !== 'false';

function normalizeMountPath(basePath) {
  if (!basePath || basePath === '/') return '';
  return `/${basePath.replace(/^\/+|\/+$/g, '')}`;
}

const frontendMountPath = normalizeMountPath(FRONTEND_BASE);
const frontendDistPath = path.resolve(__dirname, FRONTEND_DIST_DIR);
const frontendIndexPath = path.join(frontendDistPath, 'index.html');

// 解析 CORS 白名单（逗号分隔）
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// ============================
// 安全与基础中间件
// ============================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'http:', 'https:'],
      mediaSrc: ["'self'", 'data:', 'blob:', 'http:', 'https:'],
      connectSrc: ["'self'", 'http:', 'https:'],
      fontSrc: ["'self'", 'data:']
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(
  cors({
    origin: corsOrigins,
    credentials: true
  })
);

// 请求体解析（支持大文件上传，上限 50MB）
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// HTTP 请求日志（开发环境 dev，生产环境 combined）
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// request_id 中间件（生成/复用追踪 ID）
app.use(requestIdMiddleware);

// 审计上下文中间件（采集 IP/UA）
app.use(auditContextMiddleware);

// 记录客户端主动断开的 API 请求，避免前端超时后后端错误无处可查。
app.use((req, res, next) => {
  if (!req.originalUrl?.startsWith('/api')) return next();

  let finished = false;
  let logged = false;
  const logClientAbort = () => {
    if (finished || logged) return;
    logged = true;
    recordError({
      requestId: res.locals?.requestId || null,
      scope: req.originalUrl.startsWith('/api/admin') ? 'admin_api' : 'user_api',
      level: 'warn',
      code: 49901,
      httpStatus: 499,
      method: req.method,
      path: req.originalUrl,
      userId: req.userId || req.user?.id || null,
      clientIp: req.auditContext?.ip || req.ip || null,
      userAgent: req.auditContext?.userAgent || req.get?.('user-agent') || null,
      message: '客户端在响应完成前断开连接',
      publicMessage: '请求已取消',
      details: { type: 'client_aborted' }
    });
  };

  res.on('finish', () => {
    finished = true;
  });
  req.on('aborted', logClientAbort);
  res.on('close', logClientAbort);
  return next();
});

// API 全局速率限制。静态资源不参与计数，避免后台页面加载资源时误触发 429。
app.use('/api', globalRateLimitMiddleware);

// 本地存储访问：先查 files 表状态，避免软删除/隔离文件被旧 URL 直接访问。
app.get('/storage/*', async (req, res) => {
  try {
    const { file, absolutePath } = await getPublicFileByStoragePath(req.params[0]);
    res.setHeader('Cache-Control', NODE_ENV === 'production' ? 'public, max-age=604800' : 'no-store');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.removeHeader('Access-Control-Allow-Credentials');
    if (file.mimeType) res.type(file.mimeType);
    return res.sendFile(absolutePath);
  } catch (err) {
    if (err instanceof StorageError || Number.isInteger(err.code)) {
      return error(res, err.code || 40402, err.message || '文件不存在或已删除', err.code === 40001 ? 400 : 404);
    }
    logger.error(`文件访问异常：${err.message}`, { stack: err.stack, path: req.originalUrl });
    return error(res, 50001, '服务器内部错误', 500);
  }
});

// ============================
// 路由挂载
// ============================
// 健康检查（无需鉴权）
app.get('/api/health', (req, res) => {
  return success(res, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: NODE_ENV
  }, '服务运行中');
});

// 业务路由
app.use('/api', routes);

// ============================
// 前端静态资源托管（单服务部署）
// ============================
if (SERVE_FRONTEND) {
  if (fs.existsSync(frontendIndexPath)) {
    logger.info(`前端静态文件目录：${frontendDistPath}`);
    logger.info(`前端访问入口：http://localhost:${PORT}${frontendMountPath || '/'}`);

    if (frontendMountPath) {
      app.get('/', (req, res) => {
        return res.redirect(`${frontendMountPath}/`);
      });
      app.use(frontendMountPath, express.static(frontendDistPath, {
        index: false,
        maxAge: NODE_ENV === 'production' ? '7d' : 0
      }));
      app.get([frontendMountPath, `${frontendMountPath}/`, `${frontendMountPath}/*`], (req, res) => {
        return res.sendFile(frontendIndexPath);
      });
    } else {
      app.use(express.static(frontendDistPath, {
        index: false,
        maxAge: NODE_ENV === 'production' ? '7d' : 0
      }));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        return res.sendFile(frontendIndexPath);
      });
    }
  } else {
    logger.warn(`未找到前端构建产物：${frontendIndexPath}。运行 npm run build 后，后端将自动托管前端。`);
  }
}

// ============================
// 404 处理
// ============================
app.use((req, res) => {
  return error(res, 40402, `请求的资源不存在：${req.method} ${req.originalUrl}`, 404);
});

// ============================
// 统一错误处理中间件
// ============================
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const requestId = res.locals.requestId;
  logger.error(`未捕获异常：${err.message}`, {
    request_id: requestId,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method
  });

  // 参数校验错误（express-validator）
  if (err.type === 'entity.parse.failed') {
    return error(res, 42201, '请求体 JSON 格式错误', 400);
  }

  // 默认返回 500 内部错误
  return error(res, 50001, NODE_ENV === 'production' ? '服务器内部错误' : err.message, 500);
});

// ============================
// 启动服务
// ============================
/**
 * 启动 Express 服务
 * 先测试 MySQL 与 Redis 连接（失败仅警告不阻断），再监听端口
 */
async function startServer() {
  logger.info(`环境：${NODE_ENV}，端口：${PORT}`);
  logger.info(`CORS 白名单：${corsOrigins.join(', ')}`);
  if (runtimeEnv.generatedKeys.length > 0) {
    logger.info(`已自动生成运行密钥：${runtimeEnv.generatedKeys.join(', ')}，保存至 ${runtimeEnv.generatedEnvFile}`);
  }

  // 测试数据库与 Redis 连接（失败不崩溃）
  await testMysql();
  await testRedis();

  app.listen(PORT, () => {
    logger.info(`Doodle-Canvas 后端服务已启动，监听端口 ${PORT}`);
    logger.info(`健康检查：http://localhost:${PORT}/api/health`);
  });
}

// 捕获未处理的 Promise 异常，防止进程崩溃
process.on('unhandledRejection', (reason) => {
  logger.error('未处理的 Promise 异常：', reason);
  recordError({
    scope: 'process',
    level: 'error',
    message: reason?.message || String(reason),
    stack: reason?.stack || null,
    details: { type: 'unhandledRejection' }
  });
});

process.on('uncaughtException', (err) => {
  logger.error('未捕获的异常：', err);
  recordError({
    scope: 'process',
    level: 'error',
    message: err?.message || String(err),
    stack: err?.stack || null,
    details: { type: 'uncaughtException' }
  });
});

// 启动服务
startServer();

export default app;
