// -*- coding: utf-8 -*-
/**
 * 用户组服务
 * - 管理用户计费分组
 * - 分配 / 移除用户组
 * - 维护 users.user_group_id 主组冗余字段
 */
import { Op } from 'sequelize';

import db from '../models/index.js';

const { sequelize, User, UserGroup, UserGroupMember } = db;

export class UserGroupError extends Error {
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

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new UserGroupError(42201, '数值格式不正确');
  }
  return num;
}

function sanitize(model) {
  if (!model) return null;
  return typeof model.toJSON === 'function' ? model.toJSON() : { ...model };
}

async function requireUser(userId, options = {}) {
  const user = await User.findByPk(userId, options);
  if (!user) {
    throw new UserGroupError(40401, '用户不存在');
  }
  return user;
}

async function requireGroup(groupId, options = {}) {
  const group = await UserGroup.findByPk(groupId, options);
  if (!group) {
    throw new UserGroupError(40401, '用户组不存在');
  }
  return group;
}

function groupPayload(data = {}) {
  const payload = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.code !== undefined) payload.code = data.code;
  if (data.description !== undefined) payload.description = data.description || null;
  if (data.isDefault !== undefined) payload.isDefault = normalizeBoolean(data.isDefault);
  if (data.costMultiplier !== undefined) payload.costMultiplier = toNumber(data.costMultiplier, 1);
  if (data.dailyGenerateLimit !== undefined) payload.dailyGenerateLimit = parseInt(data.dailyGenerateLimit, 10) || 0;
  if (data.priority !== undefined) payload.priority = parseInt(data.priority, 10) || 0;
  if (data.badgeColor !== undefined) payload.badgeColor = data.badgeColor || null;
  if (data.isActive !== undefined) payload.isActive = normalizeBoolean(data.isActive);
  return payload;
}

async function ensureSingleDefault(groupId, transaction) {
  await UserGroup.update(
    { isDefault: false },
    {
      where: groupId ? { id: { [Op.ne]: groupId } } : {},
      transaction
    }
  );
}

export async function listGroups(params = {}) {
  const { page, pageSize, offset } = normalizePage(params.page, params.pageSize);
  const where = {};

  if (params.keyword) {
    where[Op.or] = [
      { name: { [Op.like]: `%${params.keyword}%` } },
      { code: { [Op.like]: `%${params.keyword}%` } }
    ];
  }
  if (params.isActive !== undefined && params.isActive !== '') {
    where.isActive = normalizeBoolean(params.isActive);
  }

  const { rows, count } = await UserGroup.findAndCountAll({
    where,
    order: [
      ['priority', 'DESC'],
      ['createdAt', 'DESC']
    ],
    limit: pageSize,
    offset
  });

  const memberCounts = await UserGroupMember.findAll({
    attributes: [
      'groupId',
      [sequelize.fn('COUNT', sequelize.col('id')), 'memberCount']
    ],
    group: ['groupId']
  });
  const countMap = new Map(memberCounts.map(item => [item.groupId, Number(item.get('memberCount'))]));

  return {
    items: rows.map(row => ({ ...sanitize(row), memberCount: countMap.get(row.id) || 0 })),
    total: count,
    page,
    pageSize
  };
}

export async function listAllActiveGroups() {
  return UserGroup.findAll({
    where: { isActive: true },
    order: [
      ['priority', 'DESC'],
      ['name', 'ASC']
    ]
  });
}

export async function createGroup(data = {}) {
  const payload = groupPayload(data);
  if (!payload.name || !payload.code) {
    throw new UserGroupError(42201, '用户组名称和编码不能为空');
  }

  try {
    return await sequelize.transaction(async (transaction) => {
      if (payload.isDefault) {
        await ensureSingleDefault(null, transaction);
      }
      const group = await UserGroup.create(payload, { transaction });
      return sanitize(group);
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new UserGroupError(40901, '用户组名称或编码已存在');
    }
    throw err;
  }
}

export async function updateGroup(id, data = {}) {
  const group = await requireGroup(id);
  const payload = groupPayload(data);

  try {
    return await sequelize.transaction(async (transaction) => {
      if (payload.isDefault) {
        await ensureSingleDefault(id, transaction);
      }
      await group.update(payload, { transaction });
      return sanitize(group);
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new UserGroupError(40901, '用户组名称或编码已存在');
    }
    throw err;
  }
}

export async function deleteGroup(id) {
  const group = await requireGroup(id);
  if (group.isSystem || group.isDefault) {
    throw new UserGroupError(42201, '系统默认用户组不能删除');
  }
  const memberCount = await UserGroupMember.count({ where: { groupId: id } });
  if (memberCount > 0) {
    throw new UserGroupError(40901, '用户组下仍有成员，不能删除');
  }
  await group.destroy();
  return { deleted: true };
}

export async function listUserGroups(userId) {
  await requireUser(userId, { paranoid: false });
  const memberships = await UserGroupMember.findAll({
    where: { userId },
    include: [
      {
        model: UserGroup,
        as: 'group'
      }
    ],
    order: [
      [{ model: UserGroup, as: 'group' }, 'priority', 'DESC'],
      ['joinedAt', 'DESC']
    ]
  });

  return memberships.map(item => sanitize(item));
}

async function refreshUserMainGroup(userId, transaction = null) {
  const membership = await UserGroupMember.findOne({
    where: {
      userId,
      [Op.or]: [
        { expiresAt: null },
        { expiresAt: { [Op.gt]: new Date() } }
      ]
    },
    include: [
      {
        model: UserGroup,
        as: 'group',
        where: { isActive: true }
      }
    ],
    order: [
      [{ model: UserGroup, as: 'group' }, 'priority', 'DESC'],
      ['joinedAt', 'DESC']
    ],
    transaction
  });

  await User.update(
    { userGroupId: membership?.groupId || null },
    { where: { id: userId }, transaction }
  );
  return membership;
}

export async function assignGroup(userId, groupId, data = {}, operatorId = null) {
  return sequelize.transaction(async (transaction) => {
    await requireUser(userId, { transaction });
    const group = await requireGroup(groupId, { transaction });
    if (!group.isActive) {
      throw new UserGroupError(42201, '不能分配已停用的用户组');
    }

    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    const [membership, created] = await UserGroupMember.findOrCreate({
      where: { userId, groupId },
      defaults: {
        expiresAt,
        grantedBy: operatorId,
        grantReason: data.grantReason || null
      },
      transaction
    });

    if (!created) {
      await membership.update({
        expiresAt,
        grantedBy: operatorId,
        grantReason: data.grantReason || membership.grantReason
      }, { transaction });
    }

    await refreshUserMainGroup(userId, transaction);
    return sanitize(await UserGroupMember.findByPk(membership.id, {
      include: [{ model: UserGroup, as: 'group' }],
      transaction
    }));
  });
}

export async function removeGroup(userId, groupId) {
  return sequelize.transaction(async (transaction) => {
    await requireUser(userId, { transaction });
    const count = await UserGroupMember.destroy({
      where: { userId, groupId },
      transaction
    });
    if (!count) {
      throw new UserGroupError(40401, '用户未加入该用户组');
    }
    await refreshUserMainGroup(userId, transaction);
    return { removed: true };
  });
}

export default {
  UserGroupError,
  listGroups,
  listAllActiveGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  listUserGroups,
  assignGroup,
  removeGroup
};
