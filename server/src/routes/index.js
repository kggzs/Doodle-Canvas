// -*- coding: utf-8 -*-
/**
 * 路由入口
 * 统一挂载所有业务路由到 /api 前缀下
 */
import { Router } from 'express';
import authRoutes from './auth.js';
import adminRoutes from './admin/index.js';
import modelRoutes from './models.js';
import generateRoutes from './generate.js';
import chatRoutes from './chat.js';
import coinRoutes from './coins.js';
import billingRoutes from './billing.js';
import recordRoutes from './records.js';
import projectRoutes from './projects.js';
import fileRoutes from './files.js';

const router = Router();

// 认证路由：/api/auth/*
router.use('/auth', authRoutes);

// 用户侧模型路由：/api/models/*
router.use('/models', modelRoutes);

// 用户侧生成路由：/api/generate/*
router.use('/generate', generateRoutes);

// 用户侧对话路由：/api/chat/*
router.use('/chat', chatRoutes);

// 用户侧金币路由：/api/coins/*
router.use('/coins', coinRoutes);

// 用户侧计费路由：/api/billing/*
router.use('/billing', billingRoutes);

// 用户侧生成记录：/api/records/*
router.use('/records', recordRoutes);

// 用户侧项目持久化：/api/projects/*
router.use('/projects', projectRoutes);

// 用户侧文件与上传：/api/upload/image、/api/files/*
router.use('/', fileRoutes);

// 管理路由：/api/admin/*
router.use('/admin', adminRoutes);

export default router;
