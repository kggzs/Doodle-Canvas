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
import UserGroup from './UserGroup.js';
import UserGroupMember from './UserGroupMember.js';
import UserBalance from './UserBalance.js';
import CoinTransaction from './CoinTransaction.js';
import BillingRule from './BillingRule.js';
import File from './File.js';
import GenerationRecord from './GenerationRecord.js';
import Project from './Project.js';
import SystemSetting from './SystemSetting.js';
import MigrateImport from './MigrateImport.js';
import ErrorLog from './ErrorLog.js';

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

// User 1:1 UserBalance
User.hasOne(UserBalance, {
  foreignKey: 'user_id',
  as: 'balance',
  onDelete: 'CASCADE'
});
UserBalance.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

// User N:M UserGroup
User.hasMany(UserGroupMember, {
  foreignKey: 'user_id',
  as: 'groupMemberships',
  onDelete: 'CASCADE'
});
UserGroupMember.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});
UserGroup.hasMany(UserGroupMember, {
  foreignKey: 'group_id',
  as: 'members',
  onDelete: 'CASCADE'
});
UserGroupMember.belongsTo(UserGroup, {
  foreignKey: 'group_id',
  as: 'group'
});
User.belongsToMany(UserGroup, {
  through: UserGroupMember,
  foreignKey: 'user_id',
  otherKey: 'group_id',
  as: 'groups'
});
UserGroup.belongsToMany(User, {
  through: UserGroupMember,
  foreignKey: 'group_id',
  otherKey: 'user_id',
  as: 'users'
});

// User 1:N CoinTransaction
User.hasMany(CoinTransaction, {
  foreignKey: 'user_id',
  as: 'coinTransactions',
  onDelete: 'CASCADE'
});
CoinTransaction.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

// User 1:N GenerationRecord
User.hasMany(GenerationRecord, {
  foreignKey: 'user_id',
  as: 'generationRecords',
  onDelete: 'CASCADE'
});
GenerationRecord.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

// User 1:N File
User.hasMany(File, {
  foreignKey: 'user_id',
  as: 'files',
  onDelete: 'CASCADE'
});
File.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

// User 1:N Project
User.hasMany(Project, {
  foreignKey: 'user_id',
  as: 'projects',
  onDelete: 'CASCADE'
});
Project.belongsTo(User, {
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

// ModelConfig 1:1 BillingRule
ModelConfig.hasOne(BillingRule, {
  foreignKey: 'model_id',
  as: 'billingRule',
  onDelete: 'CASCADE'
});
BillingRule.belongsTo(ModelConfig, {
  foreignKey: 'model_id',
  as: 'model'
});

// ModelConfig 1:N GenerationRecord
ModelConfig.hasMany(GenerationRecord, {
  foreignKey: 'model_id',
  as: 'generationRecords'
});
GenerationRecord.belongsTo(ModelConfig, {
  foreignKey: 'model_id',
  as: 'model'
});

// ModelChannel 1:N GenerationRecord
ModelChannel.hasMany(GenerationRecord, {
  foreignKey: 'channel_id',
  as: 'generationRecords'
});
GenerationRecord.belongsTo(ModelChannel, {
  foreignKey: 'channel_id',
  as: 'channel'
});

// GenerationRecord 1:N File
GenerationRecord.hasMany(File, {
  foreignKey: 'generation_id',
  as: 'files'
});
File.belongsTo(GenerationRecord, {
  foreignKey: 'generation_id',
  as: 'generation'
});

// Project 1:N GenerationRecord
Project.hasMany(GenerationRecord, {
  foreignKey: 'project_id',
  as: 'generationRecords'
});
GenerationRecord.belongsTo(Project, {
  foreignKey: 'project_id',
  as: 'project'
});

// Project thumbnail
Project.belongsTo(File, {
  foreignKey: 'thumbnail_file_id',
  as: 'thumbnail'
});

// User 1:N MigrateImport / Project 1:N MigrateImport
User.hasMany(MigrateImport, {
  foreignKey: 'user_id',
  as: 'migrateImports',
  onDelete: 'CASCADE'
});
MigrateImport.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});
Project.hasMany(MigrateImport, {
  foreignKey: 'project_id',
  as: 'migrateImports',
  onDelete: 'CASCADE'
});
MigrateImport.belongsTo(Project, {
  foreignKey: 'project_id',
  as: 'project'
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
  UserGroup,
  UserGroupMember,
  UserBalance,
  CoinTransaction,
  BillingRule,
  File,
  GenerationRecord,
  Project,
  SystemSetting,
  MigrateImport,
  ErrorLog,
  ModelChannel,
  ModelConfig,
  ModelChannelBinding
};

export default db;
