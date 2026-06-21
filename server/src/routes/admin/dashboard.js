// -*- coding: utf-8 -*-
/**
 * 管理端仪表盘路由
 * 路径前缀：/api/admin/dashboard
 */
import { Router } from 'express';
import { Op, fn, col, literal } from 'sequelize';

import db from '../../models/index.js';
import { error, success } from '../../utils/response.js';
import { logger } from '../../utils/logger.js';

const router = Router();
const {
  CoinTransaction,
  ErrorLog,
  File,
  GenerationRecord,
  ModelChannel,
  ModelChannelBinding,
  ModelConfig,
  User
} = db;

function startOfDay(date = new Date()) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function dayLabel(date) {
  return date.toISOString().slice(0, 10);
}

function toNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

async function sumCoins(where) {
  const row = await CoinTransaction.findOne({
    where,
    attributes: [[fn('SUM', col('amount')), 'amount']],
    raw: true
  });
  return toNumber(row?.amount);
}

async function fileStorageStats() {
  const row = await File.findOne({
    where: { status: 'active' },
    attributes: [
      [fn('COUNT', col('id')), 'totalCount'],
      [fn('SUM', col('file_size')), 'totalSize'],
      [literal("SUM(CASE WHEN mime_type LIKE 'image/%' OR type IN ('generated_image','thumbnail') THEN 1 ELSE 0 END)"), 'imageCount'],
      [literal("SUM(CASE WHEN mime_type LIKE 'image/%' OR type IN ('generated_image','thumbnail') THEN file_size ELSE 0 END)"), 'imageSize'],
      [literal("SUM(CASE WHEN mime_type LIKE 'video/%' OR type = 'generated_video' THEN 1 ELSE 0 END)"), 'videoCount'],
      [literal("SUM(CASE WHEN mime_type LIKE 'video/%' OR type = 'generated_video' THEN file_size ELSE 0 END)"), 'videoSize'],
      [literal("SUM(CASE WHEN NOT (mime_type LIKE 'image/%' OR type IN ('generated_image','thumbnail') OR mime_type LIKE 'video/%' OR type = 'generated_video') THEN 1 ELSE 0 END)"), 'otherCount'],
      [literal("SUM(CASE WHEN NOT (mime_type LIKE 'image/%' OR type IN ('generated_image','thumbnail') OR mime_type LIKE 'video/%' OR type = 'generated_video') THEN file_size ELSE 0 END)"), 'otherSize']
    ],
    raw: true
  });

  return {
    total_count: toNumber(row?.totalCount),
    total_size: toNumber(row?.totalSize),
    image_count: toNumber(row?.imageCount),
    image_size: toNumber(row?.imageSize),
    video_count: toNumber(row?.videoCount),
    video_size: toNumber(row?.videoSize),
    other_count: toNumber(row?.otherCount),
    other_size: toNumber(row?.otherSize)
  };
}

function handleError(res, err) {
  logger.error(`管理仪表盘接口异常：${err.message}`, { stack: err.stack });
  return error(res, 50001, '服务器内部错误', 500);
}

router.get('/overview', async (req, res) => {
  try {
    const todayStart = startOfDay();
    const tomorrowStart = addDays(todayStart, 1);
    const todayRange = { [Op.gte]: todayStart, [Op.lt]: tomorrowStart };

    const [
      totalUsers,
      activeUsers,
      newUsersToday,
      totalGenerations,
      generationsToday,
      generationsYesterday,
      completedGenerationsToday,
      processingGenerationsToday,
      pendingGenerationsToday,
      failedGenerationsToday,
      cancelledGenerationsToday,
      activeFiles,
      deletedFiles,
      storageStats,
      consumedToday,
      incomeToday,
      refundedToday,
      activeModels,
      activeChannels,
      activeBindings,
      circuitOpenChannels,
      errorsToday,
      unresolvedErrors
    ] = await Promise.all([
      User.count(),
      User.count({ where: { status: 'active' } }),
      User.count({ where: { createdAt: todayRange } }),
      GenerationRecord.count(),
      GenerationRecord.count({ where: { createdAt: todayRange } }),
      GenerationRecord.count({ where: { createdAt: { [Op.gte]: addDays(todayStart, -1), [Op.lt]: todayStart } } }),
      GenerationRecord.count({ where: { createdAt: todayRange, status: 'completed' } }),
      GenerationRecord.count({ where: { createdAt: todayRange, status: 'processing' } }),
      GenerationRecord.count({ where: { createdAt: todayRange, status: 'pending' } }),
      GenerationRecord.count({ where: { createdAt: todayRange, status: 'failed' } }),
      GenerationRecord.count({ where: { createdAt: todayRange, status: 'cancelled' } }),
      File.count({ where: { status: 'active' } }),
      File.count({ where: { status: 'deleted' } }),
      fileStorageStats(),
      sumCoins({ type: 'consume', direction: 'out', createdAt: todayRange }),
      sumCoins({
        type: { [Op.in]: ['recharge', 'recharge_bonus', 'redeem', 'gift', 'register_gift'] },
        direction: 'in',
        createdAt: todayRange
      }),
      sumCoins({ type: 'refund', direction: 'in', createdAt: todayRange }),
      ModelConfig.count({ where: { isActive: true } }),
      ModelChannel.count({ where: { isActive: true } }),
      ModelChannelBinding.count({ where: { isActive: true } }),
      ModelChannel.count({ where: { circuitOpen: true } }),
      ErrorLog.count({ where: { createdAt: todayRange } }),
      ErrorLog.count({ where: { isResolved: false } })
    ]);

    const successRateToday = generationsToday > 0
      ? Math.round((completedGenerationsToday / generationsToday) * 1000) / 10
      : 0;
    const generationChange = generationsYesterday > 0
      ? Math.round(((generationsToday - generationsYesterday) / generationsYesterday) * 1000) / 10
      : generationsToday > 0 ? 100 : 0;

    return success(res, {
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: Math.max(totalUsers - activeUsers, 0),
        new_today: newUsersToday,
        active_rate: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 1000) / 10 : 0
      },
      generations: {
        total: totalGenerations,
        today: generationsToday,
        yesterday: generationsYesterday,
        change_percent: generationChange,
        completed_today: completedGenerationsToday,
        processing_today: processingGenerationsToday,
        pending_today: pendingGenerationsToday,
        failed_today: failedGenerationsToday,
        cancelled_today: cancelledGenerationsToday,
        success_rate_today: successRateToday
      },
      coins: {
        consumed_today: consumedToday,
        income_today: incomeToday,
        refunded_today: refundedToday,
        net_today: incomeToday + refundedToday - consumedToday
      },
      files: {
        active: activeFiles,
        deleted: deletedFiles,
        storage: storageStats
      },
      models: {
        active: activeModels,
        active_channels: activeChannels,
        active_bindings: activeBindings,
        circuit_open_channels: circuitOpenChannels
      },
      errors: {
        today: errorsToday,
        unresolved: unresolvedErrors
      }
    }, '获取仪表盘概况成功');
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/trend', async (req, res) => {
  try {
    const todayStart = startOfDay();
    const days = Array.from({ length: 7 }, (_, index) => addDays(todayStart, index - 6));

    const items = await Promise.all(days.map(async (day) => {
      const nextDay = addDays(day, 1);
      const range = { [Op.gte]: day, [Op.lt]: nextDay };
      const [newUsers, generations, completedGenerations, failedGenerations, consumedCoins] = await Promise.all([
        User.count({ where: { createdAt: range } }),
        GenerationRecord.count({ where: { createdAt: range } }),
        GenerationRecord.count({ where: { createdAt: range, status: 'completed' } }),
        GenerationRecord.count({ where: { createdAt: range, status: 'failed' } }),
        sumCoins({ type: 'consume', direction: 'out', createdAt: range })
      ]);

      return {
        date: dayLabel(day),
        new_users: newUsers,
        generations,
        completed_generations: completedGenerations,
        failed_generations: failedGenerations,
        consumed_coins: consumedCoins
      };
    }));

    return success(res, { items }, '获取趋势数据成功');
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/model-stats', async (req, res) => {
  try {
    const rows = await GenerationRecord.findAll({
      attributes: [
        'modelId',
        [fn('COUNT', col('GenerationRecord.id')), 'total'],
        [literal("SUM(CASE WHEN `GenerationRecord`.`status` = 'completed' THEN 1 ELSE 0 END)"), 'completedCount'],
        [literal("SUM(CASE WHEN `GenerationRecord`.`status` = 'failed' THEN 1 ELSE 0 END)"), 'failedCount'],
        [fn('AVG', col('duration_ms')), 'avgDurationMs'],
        [fn('SUM', col('cost_amount')), 'costAmount']
      ],
      include: [
        {
          model: ModelConfig,
          as: 'model',
          attributes: ['id', 'modelKey', 'displayName', 'modelType'],
          required: false
        }
      ],
      group: ['GenerationRecord.model_id', 'model.id'],
      order: [[fn('COUNT', col('GenerationRecord.id')), 'DESC']],
      limit: 20
    });

    const items = rows.map((row) => ({
      model_id: row.modelId,
      model: row.model,
      total: toNumber(row.get('total')),
      completed_count: toNumber(row.get('completedCount')),
      failed_count: toNumber(row.get('failedCount')),
      avg_duration_ms: toNumber(row.get('avgDurationMs')),
      cost_amount: toNumber(row.get('costAmount'))
    }));

    return success(res, { items }, '获取模型统计成功');
  } catch (err) {
    return handleError(res, err);
  }
});

export default router;
