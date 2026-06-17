// -*- coding: utf-8 -*-
/**
 * RefreshToken 模型（刷新令牌表）
 * 对应数据库表：refresh_tokens
 * - 外键关联 users(id)，ON DELETE CASCADE
 * - 提供类方法：findValidByHash / revokeByUserId / revokeById
 */
import { DataTypes, Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * 定义 RefreshToken 模型
 * 字段与 server/sql/init.sql 中 refresh_tokens 表保持一致
 */
const RefreshToken = sequelize.define(
  'RefreshToken',
  {
    id: {
      type: DataTypes.CHAR(36),
      primaryKey: true,
      allowNull: false,
      comment: 'UUID'
    },
    userId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      field: 'user_id',
      comment: '所属用户 ID'
    },
    tokenHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: 'token_hash',
      comment: '令牌哈希（SHA-256）'
    },
    deviceInfo: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      field: 'device_info',
      comment: '设备信息（UA 解析后的简要描述）'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at',
      comment: '过期时间'
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'revoked_at',
      comment: '撤销时间（NULL=未撤销）'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  },
  {
    tableName: 'refresh_tokens',
    timestamps: true,
    updatedAt: false, // 该表无 updated_at 字段
    underscored: true,
    freezeTableName: true,
    hooks: {
      /**
       * 验证前钩子：若未提供 id，则自动生成 UUID
       * 注：Sequelize 中 notNull 验证在 beforeCreate 之前执行，
       *     因此必须在 beforeValidate 中生成 UUID，否则会触发 notNull 违约
       * @param {RefreshToken} instance 模型实例
       */
      beforeValidate(instance) {
        if (!instance.id) {
          instance.id = uuidv4();
        }
      }
    }
  }
);

/**
 * 类方法：按 token_hash 查询有效令牌
 * 有效条件：未过期（expires_at > NOW）且未撤销（revoked_at IS NULL）
 * @param {string} tokenHash 令牌哈希
 * @returns {Promise<RefreshToken|null>} 令牌实例
 */
RefreshToken.findValidByHash = function (tokenHash) {
  return this.findOne({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { [Op.gt]: new Date() }
    }
  });
};

/**
 * 类方法：撤销指定用户的所有令牌（可选排除某个令牌）
 * 典型场景：用户登出全部设备 / 修改密码后吊销全部会话
 * @param {string} userId 用户 ID
 * @param {string} [exceptTokenId] 需要保留的令牌 ID（如当前会话）
 * @returns {Promise<number>} 受影响的行数
 */
RefreshToken.revokeByUserId = function (userId, exceptTokenId) {
  const where = { userId, revokedAt: null };
  // 若指定了需保留的令牌 ID，则从撤销条件中排除
  if (exceptTokenId) {
    where.id = { [Op.ne]: exceptTokenId };
  }
  return this.update(
    { revokedAt: new Date() },
    { where }
  ).then(([affectedCount]) => affectedCount);
};

/**
 * 类方法：按 ID 撤销单个令牌
 * 典型场景：用户登出当前设备
 * @param {string} id 令牌 ID
 * @returns {Promise<number>} 受影响的行数
 */
RefreshToken.revokeById = function (id) {
  return this.update(
    { revokedAt: new Date() },
    { where: { id, revokedAt: null } }
  ).then(([affectedCount]) => affectedCount);
};

export default RefreshToken;
