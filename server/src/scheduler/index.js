// -*- coding: utf-8 -*-
/**
 * 调度器入口
 * 后续 Task 将实现：
 * - rotation.js        渠道轮换（round_robin/weighted_random/priority/failover）
 * - circuit-breaker.js 熔断器（CLOSED/OPEN/半开状态机）
 * - health-check.js    渠道健康检查
 * 当前为占位文件
 */
import { logger } from '../utils/logger.js';

/**
 * 初始化调度器
 * 启动定时任务（健康检查、对账等）
 */
export function initScheduler() {
  logger.info('调度器初始化完成（占位，后续 Task 实现）');
}

export default { initScheduler };
