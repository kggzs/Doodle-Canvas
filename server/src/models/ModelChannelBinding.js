// -*- coding: utf-8 -*-
/**
 * ModelChannelBinding 模型（模型-渠道绑定表）
 * 对应数据库表：model_channel_bindings
 * - 一个模型可绑定多个渠道地址
 * - 每条绑定独立配置轮换权重与策略
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

const ModelChannelBinding = sequelize.define(
  'ModelChannelBinding',
  {
    id: {
      type: DataTypes.CHAR(36),
      primaryKey: true,
      allowNull: false
    },
    modelId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      field: 'model_id'
    },
    channelId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      field: 'channel_id'
    },
    rotationWeight: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'rotation_weight'
    },
    rotationStrategy: {
      type: DataTypes.ENUM('round_robin', 'weighted_random', 'priority', 'failover'),
      allowNull: false,
      defaultValue: 'round_robin',
      field: 'rotation_strategy'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active'
    },
    lastUsedIndex: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'last_used_index'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  },
  {
    tableName: 'model_channel_bindings',
    timestamps: true,
    updatedAt: false,
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

export default ModelChannelBinding;
