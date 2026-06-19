// -*- coding: utf-8 -*-
/**
 * 金币服务
 * - 查询用户余额
 * - 管理员充值 / 赠送 / 调整金币
 * - 每次变动写入 coin_transactions
 */
import { Op, fn, col } from 'sequelize';

import db from '../models/index.js';

const {
  sequelize,
  User,
  UserBalance,
  CoinTransaction,
  File,
  GenerationRecord,
  ModelChannel,
  ModelConfig,
  Project
} = db;

const IN_TYPES = new Set(['recharge', 'recharge_bonus', 'redeem', 'gift', 'register_gift', 'refund', 'adjust_add', 'unfreeze', 'transfer_in', 'rollback']);
const OUT_TYPES = new Set(['consume', 'adjust_deduct', 'freeze', 'forfeit', 'expire', 'transfer_out']);

export class CoinError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

function normalizePage(page = 1, pageSize = 20) {
  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  return {
    page: currentPage,
    pageSize: limit,
    offset: (currentPage - 1) * limit
  };
}

function toMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new CoinError(42201, '金币金额格式不正确');
  }
  return Math.round(num * 100) / 100;
}

function txDescription(type, reason) {
  if (reason) return reason;
  const labels = {
    recharge: '充值入账',
    recharge_bonus: '充值赠送',
    redeem: '卡密兑换',
    gift: '赠送金币',
    register_gift: '注册赠送',
    consume: '生成消费',
    refund: '生成失败退款',
    adjust_add: '管理员增加金币',
    adjust_deduct: '管理员扣减金币',
    freeze: '冻结金币',
    unfreeze: '解冻金币',
    forfeit: '没收金币',
    expire: '金币过期',
    transfer_in: '转入金币',
    transfer_out: '转出金币',
    rollback: '流水冲正'
  };
  return labels[type] || '金币变动';
}

function assertPositiveAmount(amount) {
  if (amount <= 0) {
    throw new CoinError(42201, '金币金额必须大于 0');
  }
}

async function requireUser(userId, transaction = null) {
  const user = await User.findByPk(userId, { transaction });
  if (!user) {
    throw new CoinError(40401, '用户不存在');
  }
  return user;
}

function isUniqueConstraintError(err) {
  return err?.name === 'SequelizeUniqueConstraintError'
    || err?.original?.code === 'ER_DUP_ENTRY'
    || err?.parent?.code === 'ER_DUP_ENTRY';
}

export async function getOrCreateBalance(userId, transaction = null, lock = false) {
  await requireUser(userId, transaction);

  let balance = await UserBalance.findOne({
    where: { userId },
    transaction,
    lock: lock && transaction ? transaction.LOCK?.UPDATE || true : undefined
  });

  if (!balance) {
    try {
      balance = await UserBalance.create({ userId, balance: 0 }, { transaction });
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      balance = await UserBalance.findOne({
        where: { userId },
        transaction,
        lock: lock && transaction ? transaction.LOCK?.UPDATE || true : undefined
      });
      if (!balance) throw err;
    }
    if (lock && transaction) {
      balance = await UserBalance.findOne({
        where: { userId },
        transaction,
        lock: transaction.LOCK?.UPDATE || true
      });
    }
  }

  return balance;
}

export async function transact({
  userId,
  type,
  direction = null,
  amount,
  operatorId = null,
  operatorType = 'system',
  reason = null,
  reasonCode = null,
  description = null,
  refType = null,
  refId = null,
  relatedTxId = null,
  metadata = null,
  requestId = null,
  clientIp = null,
  userAgent = null,
  costSnapshot = null
}) {
  const normalizedAmount = toMoney(amount);
  assertPositiveAmount(normalizedAmount);

  const resolvedDirection = direction
    || (IN_TYPES.has(type) ? 'in' : OUT_TYPES.has(type) ? 'out' : null);

  if (!['in', 'out'].includes(resolvedDirection)) {
    throw new CoinError(42201, 'direction 不支持');
  }

  return sequelize.transaction(async (transaction) => {
    const balance = await getOrCreateBalance(userId, transaction, true);
    const before = toMoney(balance.balance);
    const after = resolvedDirection === 'in'
      ? toMoney(before + normalizedAmount)
      : toMoney(before - normalizedAmount);

    if (after < 0) {
      throw new CoinError(40201, '用户金币余额不足', {
        balance: before,
        required: normalizedAmount
      });
    }

    const updatePayload = {
      balance: after,
      version: balance.version + 1,
      lastTransactionAt: new Date()
    };

    if (['recharge', 'redeem'].includes(type)) {
      updatePayload.totalRecharged = toMoney(Number(balance.totalRecharged || 0) + normalizedAmount);
    }
    if (['gift', 'register_gift', 'recharge_bonus'].includes(type)) {
      updatePayload.totalGifted = toMoney(Number(balance.totalGifted || 0) + normalizedAmount);
    }
    if (type === 'consume') updatePayload.totalConsumed = toMoney(Number(balance.totalConsumed || 0) + normalizedAmount);
    if (type === 'refund') updatePayload.totalRefunded = toMoney(Number(balance.totalRefunded || 0) + normalizedAmount);
    if (type === 'expire') updatePayload.totalExpired = toMoney(Number(balance.totalExpired || 0) + normalizedAmount);

    await balance.update(updatePayload, { transaction });

    const finalDescription = description || txDescription(type, reason);
    const tx = await CoinTransaction.create({
      userId,
      type,
      direction: resolvedDirection,
      amount: normalizedAmount,
      balanceBefore: before,
      balanceAfter: after,
      refType: refType || 'manual',
      refId,
      relatedTxId,
      reasonCode,
      description: finalDescription,
      operatorId,
      operatorType,
      reason: finalDescription,
      metadata,
      requestId,
      clientIp,
      userAgent,
      costSnapshot
    }, { transaction });

    return {
      balance,
      transaction: tx
    };
  });
}

export async function adjustUserCoins(userId, data = {}, operatorId = null, requestId = null) {
  const amount = toMoney(data.amount);
  const mode = data.mode || 'increase';

  if (mode === 'increase') {
    return transact({
      userId,
      type: data.type || 'adjust_add',
      direction: 'in',
      amount,
      operatorId,
      operatorType: 'admin',
      refType: 'admin_op',
      reason: data.reason || '管理员增加金币',
      metadata: { mode },
      requestId
    });
  }

  if (mode === 'decrease') {
    return transact({
      userId,
      type: data.type || 'adjust_deduct',
      direction: 'out',
      amount,
      operatorId,
      operatorType: 'admin',
      refType: 'admin_op',
      reason: data.reason || '管理员扣减金币',
      metadata: { mode },
      requestId
    });
  }

  throw new CoinError(42201, 'mode 不支持');
}

export async function listTransactions(params = {}) {
  const { page, pageSize, offset } = normalizePage(params.page, params.pageSize);
  const where = {};

  if (params.userId) where.userId = params.userId;
  if (params.type) where.type = params.type;
  if (params.direction) where.direction = params.direction;
  if (params.keyword) {
    where[Op.or] = [
      { reason: { [Op.like]: `%${params.keyword}%` } },
      { description: { [Op.like]: `%${params.keyword}%` } },
      { metadata: { [Op.like]: `%${params.keyword}%` } },
      { costSnapshot: { [Op.like]: `%${params.keyword}%` } },
      { txNo: { [Op.like]: `%${params.keyword}%` } },
      { refType: { [Op.like]: `%${params.keyword}%` } },
      { refId: { [Op.like]: `%${params.keyword}%` } }
    ];
  }

  const { rows, count } = await CoinTransaction.findAndCountAll({
    where,
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'email']
      }
    ],
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset
  });

  const generationIds = [...new Set(rows
    .filter((row) => row.refType === 'generation' && row.refId)
    .map((row) => row.refId))];

  if (generationIds.length) {
    const records = await GenerationRecord.findAll({
      where: { id: { [Op.in]: generationIds } },
      include: [
        { model: Project, as: 'project', attributes: ['id', 'name'], required: false },
        { model: ModelConfig, as: 'model', attributes: ['id', 'modelKey', 'displayName', 'modelType'], required: false },
        { model: ModelChannel, as: 'channel', attributes: ['id', 'name', 'providerType'], required: false },
        { model: File, as: 'files', attributes: ['id', 'type', 'fileName', 'fileUrl', 'mimeType', 'status'], required: false }
      ]
    });
    const recordMap = new Map(records.map((record) => [record.id, record]));
    for (const row of rows) {
      row.setDataValue('generation', recordMap.get(row.refId) || null);
    }
  }

  return {
    items: rows,
    total: count,
    page,
    pageSize
  };
}

export async function getBalance(userId) {
  return getOrCreateBalance(userId);
}

export async function getSummary(userId) {
  const balance = await getOrCreateBalance(userId);
  const grouped = await CoinTransaction.findAll({
    where: { userId },
    attributes: [
      'type',
      'direction',
      [fn('SUM', col('amount')), 'amount']
    ],
    group: ['type', 'direction'],
    raw: true
  });

  const summary = {
    recharge: 0,
    consume: 0,
    gift: 0,
    refund: 0,
    adjust: 0,
    frozen: Number(balance.coinsFrozen || 0),
    available: Number(balance.balance || 0)
  };

  for (const item of grouped) {
    const amount = Number(item.amount || 0);
    if (['recharge', 'redeem'].includes(item.type)) summary.recharge += amount;
    if (item.type === 'consume') summary.consume += amount;
    if (['gift', 'register_gift', 'recharge_bonus'].includes(item.type)) summary.gift += amount;
    if (item.type === 'refund') summary.refund += amount;
    if (['adjust_add', 'adjust_deduct'].includes(item.type)) {
      summary.adjust += item.direction === 'in' ? amount : -amount;
    }
  }

  return {
    balance,
    summary
  };
}

export default {
  CoinError,
  getOrCreateBalance,
  getBalance,
  transact,
  adjustUserCoins,
  listTransactions,
  getSummary
};
