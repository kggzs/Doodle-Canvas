// -*- coding: utf-8 -*-
/**
 * EmailVerification 模型（邮箱认证表）
 * 对应数据库表：email_verifications
 * - 支持两种认证方式：验证码（6 位）和验证链接（一次性 Token）
 * - purpose 取值：register / reset_password / change_email / login
 * - 提供类方法：findLatestByEmail / markConsumed / incrementAttempts
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * 定义 EmailVerification 模型
 * 字段与 server/sql/init.sql 中 email_verifications 表保持一致
 */
const EmailVerification = sequelize.define(
  'EmailVerification',
  {
    id: {
      type: DataTypes.CHAR(36),
      primaryKey: true,
      allowNull: false,
      comment: 'UUID'
    },
    userId: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'user_id',
      comment: '已注册但未认证的用户（pending_email）'
    },
    email: {
      type: DataTypes.STRING(191),
      allowNull: false,
      comment: '待认证邮箱（也用于注册前预校验）'
    },
    code: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
      comment: '6 位验证码（bcrypt 存储，code 模式）'
    },
    tokenHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
      field: 'token_hash',
      comment: '验证链接 Token 哈希（链接模式）'
    },
    purpose: {
      type: DataTypes.ENUM('register', 'reset_password', 'change_email', 'login'),
      allowNull: false,
      comment: '用途：register/reset_password/change_email/login'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at',
      comment: '过期时间（默认 30 分钟）'
    },
    consumedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'consumed_at',
      comment: '已使用时间'
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '尝试次数（防爆破，上限 5）'
    },
    requestIp: {
      type: DataTypes.STRING(45),
      allowNull: true,
      defaultValue: null,
      field: 'request_ip',
      comment: '请求 IP'
    },
    requestUserAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      field: 'request_user_agent',
      comment: '请求 UA'
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'sent_at',
      comment: '邮件实际发送时间'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  },
  {
    tableName: 'email_verifications',
    timestamps: true,
    updatedAt: false, // 该表无 updated_at 字段
    underscored: true,
    freezeTableName: true,
    hooks: {
      /**
       * 验证前钩子：若未提供 id，则自动生成 UUID
       * 注：Sequelize 中 notNull 验证在 beforeCreate 之前执行，
       *     因此必须在 beforeValidate 中生成 UUID，否则会触发 notNull 违约
       * @param {EmailVerification} instance 模型实例
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
 * 类方法：查询指定邮箱和用途的最新一条未消耗记录
 * 典型场景：用户提交验证码时，定位到最新一条待校验的记录
 * @param {string} email 邮箱
 * @param {string} purpose 用途（register/reset_password/change_email/login）
 * @returns {Promise<EmailVerification|null>} 最新一条记录
 */
EmailVerification.findLatestByEmail = function (email, purpose) {
  return this.findOne({
    where: { email, purpose, consumedAt: null },
    order: [['created_at', 'DESC']]
  });
};

/**
 * 类方法：标记记录为已消耗
 * 典型场景：验证码校验通过后，将记录置为已使用，防止重复使用
 * @param {string} id 记录 ID
 * @returns {Promise<number>} 受影响的行数
 */
EmailVerification.markConsumed = function (id) {
  return this.update(
    { consumedAt: new Date() },
    { where: { id, consumedAt: null } }
  ).then(([affectedCount]) => affectedCount);
};

/**
 * 类方法：自增尝试次数
 * 典型场景：用户输入错误验证码时，attempts +1，达到上限后拒绝继续尝试
 * @param {string} id 记录 ID
 * @returns {Promise<number>} 受影响的行数
 */
EmailVerification.incrementAttempts = function (id) {
  return this.increment('attempts', { where: { id } })
    .then(([affectedCount]) => affectedCount);
};

export default EmailVerification;
