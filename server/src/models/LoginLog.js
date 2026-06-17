// -*- coding: utf-8 -*-
/**
 * LoginLog 模型（登录日志表，全量记录）
 * 对应数据库表：login_logs
 * - 每一次登录尝试（无论成功失败）都落库
 * - 主键为 BIGINT AUTO_INCREMENT
 * - 提供类方法：createLog / findRecentByUserId / findRecentByIp
 */
import { DataTypes, Op } from 'sequelize';
import { sequelize } from '../config/database.js';

/**
 * 定义 LoginLog 模型
 * 字段与 server/sql/init.sql 中 login_logs 表保持一致
 */
const LoginLog = sequelize.define(
  'LoginLog',
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      comment: '自增主键'
    },
    userId: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'user_id',
      comment: '失败时若能识别用户则记录'
    },
    emailOrUsername: {
      type: DataTypes.STRING(191),
      allowNull: true,
      defaultValue: null,
      field: 'email_or_username',
      comment: '登录账号输入值（脱敏存储）'
    },
    loginType: {
      type: DataTypes.ENUM('password', 'email_code', 'oauth', 'refresh'),
      allowNull: false,
      defaultValue: 'password',
      field: 'login_type',
      comment: '登录类型'
    },
    status: {
      type: DataTypes.ENUM('success', 'failed', 'locked', 'disabled', 'banned', 'pending_email'),
      allowNull: false,
      comment: '登录结果状态'
    },
    failReason: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null,
      field: 'fail_reason',
      comment: 'WRONG_PASSWORD / NOT_FOUND / LOCKED / BANNED...'
    },
    ip: {
      type: DataTypes.STRING(45),
      allowNull: false,
      comment: '登录 IP（兼容 IPv6）'
    },
    ipCountry: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
      field: 'ip_country',
      comment: '解析后的国家'
    },
    ipRegion: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
      field: 'ip_region',
      comment: '省/州'
    },
    ipCity: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
      field: 'ip_city',
      comment: '城市'
    },
    ipIsp: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null,
      field: 'ip_isp',
      comment: '运营商'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      field: 'user_agent',
      comment: '原始 UA'
    },
    uaBrowser: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
      field: 'ua_browser',
      comment: '解析后的浏览器'
    },
    uaOs: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
      field: 'ua_os',
      comment: '解析后的操作系统'
    },
    uaDevice: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
      field: 'ua_device',
      comment: '解析后的设备类型（PC/Mobile/Tablet/Bot）'
    },
    uaIsBot: {
      type: DataTypes.TINYINT(1),
      allowNull: false,
      defaultValue: 0,
      field: 'ua_is_bot',
      comment: '是否为爬虫'
    },
    deviceFingerprint: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
      field: 'device_fingerprint',
      comment: '前端指纹（可选）'
    },
    refreshTokenId: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'refresh_token_id',
      comment: '成功登录对应的会话'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  },
  {
    tableName: 'login_logs',
    timestamps: true,
    updatedAt: false, // 该表无 updated_at 字段
    underscored: true,
    freezeTableName: true
  }
);

/**
 * 类方法：创建登录日志
 * @param {object} data 日志数据
 * @param {string} [data.userId] 用户 ID
 * @param {string} [data.emailOrUsername] 登录账号输入值
 * @param {string} [data.loginType] 登录类型（默认 password）
 * @param {string} data.status 登录结果状态
 * @param {string} [data.failReason] 失败原因
 * @param {string} data.ip IP 地址
 * @param {string} [data.ipCountry] 国家
 * @param {string} [data.ipRegion] 省/州
 * @param {string} [data.ipCity] 城市
 * @param {string} [data.ipIsp] 运营商
 * @param {string} [data.userAgent] UA
 * @param {string} [data.uaBrowser] 浏览器
 * @param {string} [data.uaOs] 操作系统
 * @param {string} [data.uaDevice] 设备类型
 * @param {number} [data.uaIsBot] 是否为爬虫
 * @param {string} [data.deviceFingerprint] 设备指纹
 * @param {string} [data.refreshTokenId] 刷新令牌 ID
 * @returns {Promise<LoginLog>} 创建的日志实例
 */
LoginLog.createLog = function (data) {
  return this.create(data);
};

/**
 * 类方法：查询指定用户最近的登录记录
 * 典型场景：风控检测连续登录失败、登录异常告警
 * @param {string} userId 用户 ID
 * @param {number} [limit=10] 返回条数上限
 * @returns {Promise<LoginLog[]>} 登录记录列表（按时间倒序）
 */
LoginLog.findRecentByUserId = function (userId, limit = 10) {
  return this.findAll({
    where: { userId },
    order: [['created_at', 'DESC']],
    limit
  });
};

/**
 * 类方法：查询指定 IP 在最近 N 分钟内的登录记录
 * 典型场景：基于 IP 的登录限频与防爆破
 * @param {string} ip IP 地址
 * @param {number} [minutes=5] 时间窗口（分钟）
 * @returns {Promise<LoginLog[]>} 登录记录列表（按时间倒序）
 */
LoginLog.findRecentByIp = function (ip, minutes = 5) {
  // 计算时间窗口起点
  const since = new Date(Date.now() - minutes * 60 * 1000);
  return this.findAll({
    where: {
      ip,
      createdAt: { [Op.gte]: since }
    },
    order: [['created_at', 'DESC']]
  });
};

export default LoginLog;
