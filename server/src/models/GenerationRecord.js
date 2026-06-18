// -*- coding: utf-8 -*-
/**
 * GenerationRecord 生成记录模型
 * 对应数据库表：generation_records
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

function parseJson(raw) {
  if (raw === null || raw === undefined || typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function stringifyJson(value) {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const GenerationRecord = sequelize.define(
  'GenerationRecord',
  {
    id: {
      type: DataTypes.CHAR(36),
      primaryKey: true,
      allowNull: false
    },
    userId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      field: 'user_id'
    },
    modelId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      field: 'model_id'
    },
    channelId: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'channel_id'
    },
    type: {
      type: DataTypes.ENUM('image', 'video', 'chat'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending'
    },
    inputParams: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      field: 'input_params',
      get() {
        return parseJson(this.getDataValue('inputParams'), {});
      },
      set(value) {
        this.setDataValue('inputParams', stringifyJson(value) || '{}');
      }
    },
    promptText: {
      type: DataTypes.TEXT('medium'),
      allowNull: true,
      defaultValue: null,
      field: 'prompt_text'
    },
    result: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      defaultValue: null,
      get() {
        return parseJson(this.getDataValue('result'));
      },
      set(value) {
        this.setDataValue('result', stringifyJson(value));
      }
    },
    costAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'cost_amount'
    },
    costBreakdown: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      defaultValue: null,
      field: 'cost_breakdown',
      get() {
        return parseJson(this.getDataValue('costBreakdown'));
      },
      set(value) {
        this.setDataValue('costBreakdown', stringifyJson(value));
      }
    },
    coinTxId: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'coin_tx_id'
    },
    refundTxId: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'refund_tx_id'
    },
    reviewStatus: {
      type: DataTypes.ENUM('pending', 'pass', 'review', 'reject', 'hidden'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'review_status'
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      field: 'error_message'
    },
    durationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      field: 'duration_ms'
    },
    projectId: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'project_id'
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
    uaBrowser: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
      field: 'ua_browser'
    },
    uaOs: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
      field: 'ua_os'
    },
    uaDevice: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
      field: 'ua_device'
    },
    deviceFingerprint: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
      field: 'device_fingerprint'
    },
    userGroupSnapshot: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
      field: 'user_group_snapshot'
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_deleted'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'completed_at'
    }
  },
  {
    tableName: 'generation_records',
    timestamps: false,
    underscored: true,
    freezeTableName: true,
    hooks: {
      beforeValidate(instance) {
        if (!instance.id) instance.id = uuidv4();
      }
    }
  }
);

export default GenerationRecord;
