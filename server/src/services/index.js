// -*- coding: utf-8 -*-
/**
 * 服务层入口
 * 统一导出各类业务服务：
 * - auth.js         认证服务（注册/登录/令牌/密码管理等）
 * - email.js        邮件服务（验证码/异地登录提醒/封禁通知）
 * - coin.js         金币服务（后续 Task 15 实现）
 * - billing.js      计费服务（后续 Task 16 实现）
 * - storage.js      存储服务（后续 Task 12 实现）
 * - image.js        图片生成服务（后续 Task 10 实现）
 * - video.js        视频生成服务（后续 Task 10 实现）
 * - chat.js         对话服务（后续 Task 10 实现）
 * - audit.js        审计服务（后续 Task 22 实现）
 * - risk.js         风控服务（后续 Task 22 实现）
 * - content-review.js 内容审核服务（后续 Task 22 实现）
 * - announcement.js 公告服务（后续 Task 24 实现）
 * - message.js      消息服务（后续 Task 24 实现）
 */
import * as AuthService from './auth.js';
import * as EmailService from './email.js';
import * as ModelManagementService from './model-management.js';
import * as AdminUserService from './admin-users.js';

export { AuthService, EmailService, ModelManagementService, AdminUserService };

export default {
  AuthService,
  EmailService,
  ModelManagementService,
  AdminUserService
};
