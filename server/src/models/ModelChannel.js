// -*- coding: utf-8 -*-
/**
 * ModelChannel 模型（模型渠道表）
 * 对应数据库表：model_channels
 * - 表示一个可复用的 API 地址 + Key 组合
 * - api_key 存储 AES 加密后的 JSON 字符串，序列化时不返回密文
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

const ModelChannel = sequelize.define(
  'ModelChannel',
  {
    id: {
      type: DataTypes.CHAR(36),
      primaryKey: true,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '渠道名称'
    },
    providerType: {
      type: DataTypes.ENUM('openai', 'aliyun', 'doubao', 'stepfun', 'agnes', 'custom'),
      allowNull: false,
      field: 'provider_type',
      comment: '适配器类型'
    },
    modelType: {
      type: DataTypes.ENUM('image', 'video', 'chat'),
      allowNull: false,
      defaultValue: 'chat',
      field: 'model_type',
      comment: '渠道用途类型'
    },
    apiBaseUrl: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'api_base_url',
      comment: 'API 基础地址'
    },
    apiKey: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'api_key',
      comment: 'API Key（AES 加密 JSON）'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active'
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    weight: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    maxConcurrent: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
      field: 'max_concurrent'
    },
    timeoutMs: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 60000,
      field: 'timeout_ms'
    },
    config: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      defaultValue: null,
      get() {
        return parseJson(this.getDataValue('config'));
      },
      set(value) {
        this.setDataValue('config', stringifyJson(value));
      }
    },
    totalRequests: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      field: 'total_requests'
    },
    successCount: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      field: 'success_count'
    },
    failCount: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      field: 'fail_count'
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'last_used_at'
    },
    lastFailAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'last_fail_at'
    },
    circuitOpen: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'circuit_open'
    },
    circuitOpenAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'circuit_open_at'
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
    }
  },
  {
    tableName: 'model_channels',
    timestamps: true,
    underscored: true,
    freezeTableName: true,
    hooks: {
      beforeValidate(instance) {
        if (!instance.id) {
          instance.id = uuidv4();
        }
      }
    }
  }
);

ModelChannel.prototype.toJSON = function () {
  const values = { ...this.get() };
  delete values.apiKey;
  delete values.api_key;
  values.apiKeyConfigured = true;
  return values;
};

export default ModelChannel;
