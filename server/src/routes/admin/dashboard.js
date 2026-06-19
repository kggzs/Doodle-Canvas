// -*- coding: utf-8 -*-
/**
 * 管理端仪表盘路由
 * 路径前缀：/api/admin/dashboard
 */
import { Router } from 'express';
import { Op, fn, col } from 'sequelize';

import db from '../../models/index.js';
import { error, success } from '../../utils/response.js';
import { logger } from '../../utils/logger.js';

const router = Router();
const {
  CoinTransaction,
  File,
  GenerationRecord,
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
      failedGenerationsToday,
      activeFiles,
      deletedFiles,
      consumedToday,
      incomeToday
    ] = await Promise.all([
      User.count(),
      User.count({ where: { status: 'active' } }),
      User.count({ where: { createdAt: todayRange } }),
      GenerationRecord.count(),
      GenerationRecord.count({ where: { createdAt: todayRange } }),
      GenerationRecord.count({ where: { createdAt: todayRange, status: 'failed' } }),
      File.count({ where: { status: 'active' } }),
      File.count({ where: { status: 'deleted' } }),
      sumCoins({ type: 'consume', direction: 'out', createdAt: todayRange }),
      sumCoins({
        type: { [Op.in]: ['recharge', 'recharge_bonus', 'redeem', 'gift', 'register_gift'] },
        direction: 'in',
        createdAt: todayRange
      })
    ]);

    return success(res, {
      users: {
        total: totalUsers,
        active: activeUsers,
        new_today: newUsersToday
      },
      generations: {
        total: totalGenerations,
        today: generationsToday,
        failed_today: failedGenerationsToday
      },
      coins: {
        consumed_today: consumedToday,
        income_today: incomeToday
      },
      files: {
        active: activeFiles,
        deleted: deletedFiles
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
      const [newUsers, generations, failedGenerations, consumedCoins] = await Promise.all([
        User.count({ where: { createdAt: range } }),
        GenerationRecord.count({ where: { createdAt: range } }),
        GenerationRecord.count({ where: { createdAt: range, status: 'failed' } }),
        sumCoins({ type: 'consume', direction: 'out', createdAt: range })
      ]);

      return {
        date: dayLabel(day),
        new_users: newUsers,
        generations,
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
      cost_amount: toNumber(row.get('costAmount'))
    }));

    return success(res, { items }, '获取模型统计成功');
  } catch (err) {
    return handleError(res, err);
  }
});

export default router;
