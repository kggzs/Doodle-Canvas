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

const router = Router();

// 认证路由：/api/auth/*
router.use('/auth', authRoutes);

// 用户侧模型路由：/api/models/*
router.use('/models', modelRoutes);

// 用户侧生成路由：/api/generate/*
router.use('/generate', generateRoutes);

// 用户侧对话路由：/api/chat/*
router.use('/chat', chatRoutes);

// 管理路由：/api/admin/*
router.use('/admin', adminRoutes);

export default router;
