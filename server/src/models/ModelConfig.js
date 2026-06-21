// -*- coding: utf-8 -*-
/**
 * ModelConfig 模型（模型配置表）
 * 对应数据库表：models
 * - 管理 image / video / chat 三类模型
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

const ModelConfig = sequelize.define(
  'ModelConfig',
  {
    id: {
      type: DataTypes.CHAR(36),
      primaryKey: true,
      allowNull: false
    },
    modelKey: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'model_key',
      comment: '实际调用模型名称'
    },
    displayName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'display_name',
      comment: '展示名称'
    },
    modelType: {
      type: DataTypes.ENUM('image', 'video', 'chat'),
      allowNull: false,
      field: 'model_type',
      comment: '模型类型'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active'
    },
    defaultParams: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      defaultValue: null,
      field: 'default_params',
      get() {
        return parseJson(this.getDataValue('defaultParams'));
      },
      set(value) {
        this.setDataValue('defaultParams', stringifyJson(value));
      }
    },
    maxParams: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      defaultValue: null,
      field: 'max_params',
      get() {
        return parseJson(this.getDataValue('maxParams'));
      },
      set(value) {
        this.setDataValue('maxParams', stringifyJson(value));
      }
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'sort_order'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
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
    tableName: 'models',
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

export default ModelConfig;
