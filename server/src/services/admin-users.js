// -*- coding: utf-8 -*-
/**
 * 管理端用户管理服务
 * - 用户列表 / 详情
 * - 用户资料与状态调整
 * - 封禁 / 解封
 * - 登录日志查询
 */
import { Op } from 'sequelize';

import User from '../models/User.js';
import LoginLog from '../models/LoginLog.js';
import db from '../models/index.js';
import * as CoinService from './coins.js';
import * as UserGroupService from './user-groups.js';

const { UserBalance, UserGroup, UserGroupMember } = db;

const USER_STATUSES = ['active', 'disabled', 'banned', 'pending_email'];
const USER_ROLES = ['user', 'admin'];
const RISK_LEVELS = ['low', 'medium', 'high'];

export class AdminUserError extends Error {
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

function normalizeBoolean(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function ensureOneOf(value, allowed, fieldName) {
  if (value !== undefined && value !== null && !allowed.includes(value)) {
    throw new AdminUserError(42201, `${fieldName} 不支持`);
  }
}

function sanitizeUser(user) {
  if (!user) return null;
  return typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
}

async function requireUser(id, options = {}) {
  const user = await User.findByPk(id, options);
  if (!user) {
    throw new AdminUserError(40401, '用户不存在');
  }
  return user;
}

function assertNotSelfTarget(targetUserId, operatorId, action) {
  if (targetUserId && operatorId && targetUserId === operatorId) {
    throw new AdminUserError(42201, `不能${action}当前管理员账号`);
  }
}

export async function listUsers(params = {}) {
  const { page, pageSize, offset } = normalizePage(params.page, params.pageSize);
  const where = {};

  if (params.status) {
    ensureOneOf(params.status, USER_STATUSES, 'status');
    where.status = params.status;
  }
  if (params.role) {
    ensureOneOf(params.role, USER_ROLES, 'role');
    where.role = params.role;
  }
  if (params.riskLevel) {
    ensureOneOf(params.riskLevel, RISK_LEVELS, 'risk_level');
    where.riskLevel = params.riskLevel;
  }
  if (params.keyword) {
    where[Op.or] = [
      { username: { [Op.like]: `%${params.keyword}%` } },
      { email: { [Op.like]: `%${params.keyword}%` } }
    ];
  }
  if (params.registerIp) {
    where.registerIp = params.registerIp;
  }

  const includeDeleted = normalizeBoolean(params.includeDeleted);
  const { rows, count } = await User.findAndCountAll({
    where,
    paranoid: !includeDeleted,
    order: [
      ['createdAt', 'DESC'],
      ['id', 'ASC']
    ],
    limit: pageSize,
    offset
  });

  return {
    items: rows.map(sanitizeUser),
    total: count,
    page,
    pageSize
  };
}

export async function getUserDetail(id) {
  const user = await requireUser(id, { paranoid: false });
  const [recentLoginLogs, balance, groups] = await Promise.all([
    LoginLog.findAll({
      where: { userId: id },
      order: [['createdAt', 'DESC']],
      limit: 10
    }),
    UserBalance.findOne({ where: { userId: id } }),
    UserGroupMember.findAll({
      where: { userId: id },
      include: [{ model: UserGroup, as: 'group' }],
      order: [
        [{ model: UserGroup, as: 'group' }, 'priority', 'DESC'],
        ['joinedAt', 'DESC']
      ]
    })
  ]);

  return {
    user: sanitizeUser(user),
    balance: balance || {
      userId: id,
      balance: '0.00',
      coinsFrozen: '0.00',
      totalRecharged: '0.00',
      totalGifted: '0.00',
      totalConsumed: '0.00',
      totalRefunded: '0.00',
      totalExpired: '0.00',
      version: 0
    },
    groups,
    recentLoginLogs
  };
}

export async function updateUser(id, data, operatorId) {
  const user = await requireUser(id);
  const payload = {};

  if (data.username !== undefined) payload.username = data.username;
  if (data.email !== undefined) payload.email = data.email;
  if (data.role !== undefined) {
    ensureOneOf(data.role, USER_ROLES, 'role');
    if (id === operatorId && data.role !== user.role) {
      throw new AdminUserError(42201, '不能修改当前管理员账号角色');
    }
    payload.role = data.role;
  }
  if (data.status !== undefined) {
    ensureOneOf(data.status, USER_STATUSES, 'status');
    if (data.status !== 'active') {
      assertNotSelfTarget(id, operatorId, '停用');
    }
    payload.status = data.status;
  }
  if (data.avatarUrl !== undefined) payload.avatarUrl = data.avatarUrl;
  if (data.userGroupId !== undefined) payload.userGroupId = data.userGroupId || null;
  if (data.riskLevel !== undefined) {
    ensureOneOf(data.riskLevel, RISK_LEVELS, 'risk_level');
    payload.riskLevel = data.riskLevel;
  }
  if (data.riskTags !== undefined) payload.riskTags = data.riskTags || null;
  if (data.violationCount !== undefined) payload.violationCount = data.violationCount;
  if (data.coinsFrozen !== undefined) payload.coinsFrozen = data.coinsFrozen;
  if (data.emailVerified !== undefined) {
    payload.emailVerifiedAt = normalizeBoolean(data.emailVerified) ? new Date() : null;
  }

  try {
    await user.update(payload);
    return sanitizeUser(user);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new AdminUserError(40901, '用户名或邮箱已存在');
    }
    throw err;
  }
}

export async function setUserStatus(id, status, operatorId) {
  ensureOneOf(status, USER_STATUSES, 'status');
  if (status !== 'active') {
    assertNotSelfTarget(id, operatorId, '停用');
  }
  const user = await requireUser(id);
  await user.update({ status });
  return sanitizeUser(user);
}

export async function banUser(id, data = {}, operatorId) {
  assertNotSelfTarget(id, operatorId, '封禁');
  const user = await requireUser(id);
  const bannedUntil = data.bannedUntil ? new Date(data.bannedUntil) : null;

  await user.update({
    status: 'banned',
    banReason: data.banReason || '管理员封禁',
    bannedAt: new Date(),
    bannedUntil,
    bannedBy: operatorId || null,
    unbanAt: null,
    riskLevel: data.riskLevel || user.riskLevel,
    violationCount: data.violationCount ?? user.violationCount
  });

  return sanitizeUser(user);
}

export async function unbanUser(id) {
  const user = await requireUser(id);
  await user.update({
    status: 'active',
    banReason: null,
    bannedUntil: null,
    unbanAt: new Date()
  });
  return sanitizeUser(user);
}

export async function getUserLoginLogs(id, params = {}) {
  await requireUser(id, { paranoid: false });
  const { page, pageSize, offset } = normalizePage(params.page, params.pageSize);
  const where = { userId: id };

  if (params.status) {
    where.status = params.status;
  }

  const { rows, count } = await LoginLog.findAndCountAll({
    where,
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

export async function softDeleteUser(id, operatorId) {
  assertNotSelfTarget(id, operatorId, '删除');
  const user = await requireUser(id);
  await user.destroy();
  return { deleted: true };
}

export async function getUserGroups(id) {
  return UserGroupService.listUserGroups(id);
}

export async function assignUserGroup(id, groupId, data = {}, operatorId = null) {
  return UserGroupService.assignGroup(id, groupId, data, operatorId);
}

export async function removeUserGroup(id, groupId) {
  return UserGroupService.removeGroup(id, groupId);
}

export async function rechargeUser(id, data = {}, operatorId = null, requestId = null) {
  const result = await CoinService.transact({
    userId: id,
    type: 'recharge',
    direction: 'in',
    amount: data.amount,
    operatorId,
    operatorType: 'admin',
    refType: 'admin_op',
    reason: data.reason || '管理员充值',
    metadata: {
      paymentChannel: data.paymentChannel || null,
      externalOrderNo: data.externalOrderNo || null
    },
    requestId
  });
  const balance = await UserBalance.findByPk(result.balance.id);
  return { balance, transaction: result.transaction };
}

export async function giftUser(id, data = {}, operatorId = null, requestId = null) {
  const result = await CoinService.transact({
    userId: id,
    type: 'gift',
    direction: 'in',
    amount: data.amount,
    operatorId,
    operatorType: 'admin',
    refType: 'gift_rule',
    reason: data.reason || '管理员赠送',
    metadata: { scene: data.scene || null },
    requestId
  });
  const balance = await UserBalance.findByPk(result.balance.id);
  return { balance, transaction: result.transaction };
}

export async function adjustUserCoins(id, data = {}, operatorId = null, requestId = null) {
  const result = await CoinService.adjustUserCoins(id, data, operatorId, requestId);
  const balance = await UserBalance.findByPk(result.balance.id);
  return { balance, transaction: result.transaction };
}

export default {
  AdminUserError,
  listUsers,
  getUserDetail,
  updateUser,
  setUserStatus,
  banUser,
  unbanUser,
  getUserLoginLogs,
  softDeleteUser,
  getUserGroups,
  assignUserGroup,
  removeUserGroup,
  rechargeUser,
  giftUser,
  adjustUserCoins
};
