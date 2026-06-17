// -*- coding: utf-8 -*-
/**
 * Sequelize 模型注册中心
 * - 导入所有模型
 * - 建立关联关系（User.hasMany(RefreshToken) 等）
 * - 导出所有模型和 sequelize 实例
 */
import { sequelize } from '../config/database.js';
import { Sequelize } from 'sequelize';
import User from './User.js';
import RefreshToken from './RefreshToken.js';
import EmailVerification from './EmailVerification.js';
import LoginLog from './LoginLog.js';
import ModelChannel from './ModelChannel.js';
import ModelConfig from './ModelConfig.js';
import ModelChannelBinding from './ModelChannelBinding.js';

// ============================
// 建立模型关联关系
// ============================

// User 1:N RefreshToken（一个用户可有多条刷新令牌）
User.hasMany(RefreshToken, {
  foreignKey: 'user_id',
  as: 'refreshTokens',
  onDelete: 'CASCADE'
});
RefreshToken.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

// User 1:N EmailVerification（一个用户可有多条邮箱认证记录）
User.hasMany(EmailVerification, {
  foreignKey: 'user_id',
  as: 'emailVerifications',
  onDelete: 'SET NULL'
});
EmailVerification.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

// User 1:N LoginLog（一个用户可有多条登录日志）
// 注意：login_logs.user_id 允许 NULL（登录失败且无法识别用户时），故不设置 CASCADE
User.hasMany(LoginLog, {
  foreignKey: 'user_id',
  as: 'loginLogs'
});
LoginLog.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

// ModelConfig 1:N ModelChannelBinding
ModelConfig.hasMany(ModelChannelBinding, {
  foreignKey: 'model_id',
  as: 'bindings',
  onDelete: 'CASCADE'
});
ModelChannelBinding.belongsTo(ModelConfig, {
  foreignKey: 'model_id',
  as: 'model'
});

// ModelChannel 1:N ModelChannelBinding
ModelChannel.hasMany(ModelChannelBinding, {
  foreignKey: 'channel_id',
  as: 'bindings',
  onDelete: 'CASCADE'
});
ModelChannelBinding.belongsTo(ModelChannel, {
  foreignKey: 'channel_id',
  as: 'channel'
});

// ModelConfig N:M ModelChannel
ModelConfig.belongsToMany(ModelChannel, {
  through: ModelChannelBinding,
  foreignKey: 'model_id',
  otherKey: 'channel_id',
  as: 'channels'
});
ModelChannel.belongsToMany(ModelConfig, {
  through: ModelChannelBinding,
  foreignKey: 'channel_id',
  otherKey: 'model_id',
  as: 'models'
});

/**
 * 数据库对象
 * - sequelize：Sequelize 实例
 * - Sequelize：Sequelize 类（用于数据类型引用）
 * - User / RefreshToken / EmailVerification / LoginLog：模型
 */
export const db = {
  sequelize,
  Sequelize,
  User,
  RefreshToken,
  EmailVerification,
  LoginLog,
  ModelChannel,
  ModelConfig,
  ModelChannelBinding
};

export default db;
