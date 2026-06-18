// -*- coding: utf-8 -*-
/**
 * 金币服务
 * - 查询用户余额
 * - 管理员充值 / 赠送 / 调整金币
 * - 每次变动写入 coin_transactions
 */
import { Op } from 'sequelize';

import db from '../models/index.js';

const { sequelize, User, UserBalance, CoinTransaction } = db;

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

export async function getOrCreateBalance(userId, transaction = null, lock = false) {
  await requireUser(userId, transaction);

  let balance = await UserBalance.findOne({
    where: { userId },
    transaction,
    lock: lock && transaction ? transaction.LOCK?.UPDATE || true : undefined
  });

  if (!balance) {
    balance = await UserBalance.create({ userId, balance: 0 }, { transaction });
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
  direction,
  amount,
  operatorId = null,
  operatorType = 'admin',
  reason = null,
  refType = null,
  refId = null,
  metadata = null,
  requestId = null
}) {
  const normalizedAmount = toMoney(amount);
  assertPositiveAmount(normalizedAmount);

  if (!['in', 'out'].includes(direction)) {
    throw new CoinError(42201, 'direction 不支持');
  }

  return sequelize.transaction(async (transaction) => {
    const balance = await getOrCreateBalance(userId, transaction, true);
    const before = toMoney(balance.balance);
    const after = direction === 'in'
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
      version: balance.version + 1
    };

    if (type === 'recharge') updatePayload.totalRecharge = toMoney(Number(balance.totalRecharge || 0) + normalizedAmount);
    if (type === 'gift') updatePayload.totalGift = toMoney(Number(balance.totalGift || 0) + normalizedAmount);
    if (type === 'consume') updatePayload.totalConsumed = toMoney(Number(balance.totalConsumed || 0) + normalizedAmount);
    if (type === 'refund') updatePayload.totalRefunded = toMoney(Number(balance.totalRefunded || 0) + normalizedAmount);

    await balance.update(updatePayload, { transaction });

    const tx = await CoinTransaction.create({
      userId,
      type,
      direction,
      amount: normalizedAmount,
      balanceBefore: before,
      balanceAfter: after,
      refType,
      refId,
      operatorId,
      operatorType,
      reason,
      metadata,
      requestId
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
      type: data.type || 'adjust',
      direction: 'in',
      amount,
      operatorId,
      reason: data.reason || '管理员增加金币',
      metadata: { mode },
      requestId
    });
  }

  if (mode === 'decrease') {
    return transact({
      userId,
      type: data.type || 'adjust',
      direction: 'out',
      amount,
      operatorId,
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

export default {
  CoinError,
  getOrCreateBalance,
  getBalance,
  transact,
  adjustUserCoins,
  listTransactions
};
