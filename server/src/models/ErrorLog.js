// -*- coding: utf-8 -*-
/**
 * ErrorLog 错误日志模型
 * 对应数据库表：error_logs
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { safeJsonParse } from '../utils/helpers.js';

function stringifyJson(value) {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const ErrorLog = sequelize.define(
  'ErrorLog',
  {
    id: {
      type: DataTypes.CHAR(36),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    requestId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
      field: 'request_id'
    },
    level: {
      type: DataTypes.ENUM('error', 'warn', 'info'),
      allowNull: false,
      defaultValue: 'error'
    },
    scope: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null
    },
    code: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null
    },
    httpStatus: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      field: 'http_status'
    },
    method: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: null
    },
    path: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: null
    },
    userId: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'user_id'
    },
    clientIp: {
      type: DataTypes.STRING(45),
      allowNull: true,
      defaultValue: null,
      field: 'client_ip'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      field: 'user_agent'
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    publicMessage: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
      field: 'public_message'
    },
    stack: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      defaultValue: null
    },
    details: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      defaultValue: null,
      get() {
        return safeJsonParse(this.getDataValue('details'), null);
      },
      set(value) {
        this.setDataValue('details', stringifyJson(value));
      }
    },
    isResolved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_resolved'
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'resolved_at'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  },
  {
    tableName: 'error_logs',
    timestamps: false,
    underscored: true,
    freezeTableName: true
  }
);

export default ErrorLog;
