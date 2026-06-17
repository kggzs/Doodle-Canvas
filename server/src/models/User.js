// -*- coding: utf-8 -*-
/**
 * User 模型（用户表）
 * 对应数据库表：users
 * - 使用 Sequelize define 方式定义
 * - 主键为 UUID（CHAR(36)），beforeCreate 钩子自动生成
 * - toJSON 实例方法排除 password_hash
 * - 提供类方法：findByEmail / findByUsername / findActiveById
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * 定义 User 模型
 * 字段与 server/sql/init.sql 中 users 表保持一致
 */
const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.CHAR(36),
      primaryKey: true,
      allowNull: false,
      comment: 'UUID'
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: '用户名'
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      comment: '邮箱（必填，且需认证）'
    },
    emailVerifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'email_verified_at',
      comment: '邮箱认证时间（NULL=未认证）'
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_hash',
      comment: 'bcrypt 加密'
    },
    role: {
      type: DataTypes.ENUM('user', 'admin'),
      allowNull: false,
      defaultValue: 'user',
      comment: '角色：user/admin'
    },
    status: {
      type: DataTypes.ENUM('active', 'disabled', 'banned', 'pending_email'),
      allowNull: false,
      defaultValue: 'pending_email',
      comment: '状态：pending_email=待邮箱认证；active=正常；disabled=管理员禁用；banned=风控封禁'
    },
    avatarUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      field: 'avatar_url',
      comment: '头像 URL'
    },
    // 计费分组（用户组）：冗余字段，仅为快速展示用户徽章
    userGroupId: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'user_group_id',
      comment: '主组（冗余字段，权威关系见 user_group_members）'
    },
    // 风控与封禁信息
    banReason: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: null,
      field: 'ban_reason',
      comment: '封禁原因'
    },
    bannedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'banned_at',
      comment: '封禁时间'
    },
    bannedUntil: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'banned_until',
      comment: '临时封禁截止时间（NULL=永久）'
    },
    bannedBy: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'banned_by',
      comment: '封禁操作人（admin user_id）'
    },
    unbanAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'unban_at',
      comment: '解封时间'
    },
    riskLevel: {
      type: DataTypes.ENUM('low', 'medium', 'high'),
      allowNull: false,
      defaultValue: 'low',
      field: 'risk_level',
      comment: '风险等级'
    },
    riskTags: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      field: 'risk_tags',
      comment: '风险标签数组（如 ["刷量","异地登录"]）'
    },
    violationCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'violation_count',
      comment: '累计违规次数'
    },
    coinsFrozen: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'coins_frozen',
      comment: '被冻结的金币（封禁时锁定）'
    },
    // 来源与登录信息（注册时记录）
    registerIp: {
      type: DataTypes.STRING(45),
      allowNull: true,
      defaultValue: null,
      field: 'register_ip',
      comment: '注册 IP（兼容 IPv6）'
    },
    registerUserAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      field: 'register_user_agent',
      comment: '注册时浏览器 UA'
    },
    registerReferer: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: null,
      field: 'register_referer',
      comment: '注册来源页'
    },
    registerSource: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
      field: 'register_source',
      comment: '注册渠道（web/invite/oauth...）'
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'last_login_at',
      comment: '最后登录时间'
    },
    lastLoginIp: {
      type: DataTypes.STRING(45),
      allowNull: true,
      defaultValue: null,
      field: 'last_login_ip',
      comment: '最后登录 IP'
    },
    lastLoginUserAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      field: 'last_login_user_agent',
      comment: '最后登录 UA'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'deleted_at',
      comment: '软删除（保留审计）'
    }
  },
  {
    tableName: 'users',
    timestamps: true,
    paranoid: true, // 启用软删除（deleted_at）
    underscored: true,
    freezeTableName: true,
    hooks: {
      /**
       * 验证前钩子：若未提供 id，则自动生成 UUID
       * 注：Sequelize 中 notNull 验证在 beforeCreate 之前执行，
       *     因此必须在 beforeValidate 中生成 UUID，否则会触发 notNull 违约
       * @param {User} instance 模型实例
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
 * 实例方法：toJSON 重写
 * 序列化时排除 password_hash 字段，避免敏感信息泄露
 * @returns {object} 不含 password_hash 的用户对象
 */
User.prototype.toJSON = function () {
  const values = Object.assign({}, this.get());
  delete values.password_hash;
  delete values.passwordHash;
  return values;
};

/**
 * 类方法：按邮箱查询用户
 * @param {string} email 邮箱
 * @returns {Promise<User|null>} 用户实例（含 password_hash，供登录校验使用）
 */
User.findByEmail = function (email) {
  return this.findOne({ where: { email } });
};

/**
 * 类方法：按用户名查询用户
 * @param {string} username 用户名
 * @returns {Promise<User|null>} 用户实例
 */
User.findByUsername = function (username) {
  return this.findOne({ where: { username } });
};

/**
 * 类方法：按 ID 查询未软删除的活跃用户
 * 仅返回 status='active' 的用户（排除 pending_email / disabled / banned）
 * @param {string} id 用户 ID
 * @returns {Promise<User|null>} 用户实例
 */
User.findActiveById = function (id) {
  return this.findOne({
    where: { id, status: 'active' }
  });
};

export default User;
