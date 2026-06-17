// -*- coding: utf-8 -*-
/**
 * 路由入口
 * 统一挂载所有业务路由到 /api 前缀下
 */
import { Router } from 'express';
import authRoutes from './auth.js';
import adminRoutes from './admin/index.js';

const router = Router();

// 认证路由：/api/auth/*
router.use('/auth', authRoutes);

// 管理路由：/api/admin/*
router.use('/admin', adminRoutes);

export default router;
