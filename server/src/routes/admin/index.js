// -*- coding: utf-8 -*-
/**
 * 管理路由入口
 * 后续 Task 将挂载子路由：
 * - /channels      渠道管理
 * - /models        模型管理
 * - /files         文件管理
 * - /users         用户管理
 * - /coins         金币管理
 * - /billing       计费规则
 * - /risk          风控管理
 * - /review        内容审核
 * - /announcements 公告管理
 * - /messages      消息群发
 * - /audit-logs    审计日志
 * - /access-logs   访问日志
 * - /settings      系统设置
 */
import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { adminMiddleware } from '../../middleware/admin.js';
import { success } from '../../utils/response.js';
import channelRoutes from './channels.js';
import modelRoutes from './models.js';
import userRoutes from './users.js';
import userGroupRoutes from './user-groups.js';
import coinRoutes from './coins.js';
import billingRoutes from './billing.js';
import recordRoutes from './records.js';
import fileRoutes from './files.js';

const router = Router();

// 所有管理路由均需登录 + Admin 角色
router.use(authMiddleware, adminMiddleware);

// 渠道地址池管理：/api/admin/channels/*
router.use('/channels', channelRoutes);

// 模型配置管理：/api/admin/models/*
router.use('/models', modelRoutes);

// 用户管理：/api/admin/users/*
router.use('/users', userRoutes);

// 用户组管理：/api/admin/user-groups/*
router.use('/user-groups', userGroupRoutes);

// 金币管理：/api/admin/coins/*
router.use('/coins', coinRoutes);

// 计费规则管理：/api/admin/billing/*
router.use('/billing', billingRoutes);

// 生成记录管理：/api/admin/records/*
router.use('/records', recordRoutes);

// 文件管理：/api/admin/files/*
router.use('/files', fileRoutes);

/**
 * 管理后台健康检查占位接口
 */
router.get('/', (req, res) => {
  return success(res, { admin: req.user?.id }, '管理接口运行中');
});

export default router;
