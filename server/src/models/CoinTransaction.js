// -*- coding: utf-8 -*-
/**
 * CoinTransaction 金币流水模型
 * 对应数据库表：coin_transactions
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

const CoinTransaction = sequelize.define(
  'CoinTransaction',
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
    type: {
      type: DataTypes.ENUM('recharge', 'gift', 'consume', 'refund', 'adjust', 'freeze', 'unfreeze', 'expire'),
      allowNull: false
    },
    direction: {
      type: DataTypes.ENUM('in', 'out'),
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false
    },
    balanceBefore: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: 'balance_before'
    },
    balanceAfter: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: 'balance_after'
    },
    refType: {
      type: DataTypes.STRING(40),
      allowNull: true,
      defaultValue: null,
      field: 'ref_type'
    },
    refId: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'ref_id'
    },
    operatorId: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'operator_id'
    },
    operatorType: {
      type: DataTypes.ENUM('admin', 'user', 'system'),
      allowNull: false,
      defaultValue: 'admin',
      field: 'operator_type'
    },
    reason: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null
    },
    metadata: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      defaultValue: null,
      get() {
        return parseJson(this.getDataValue('metadata'));
      },
      set(value) {
        this.setDataValue('metadata', stringifyJson(value));
      }
    },
    requestId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
      field: 'request_id'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  },
  {
    tableName: 'coin_transactions',
    timestamps: true,
    updatedAt: false,
    underscored: true,
    freezeTableName: true,
    hooks: {
      beforeValidate(instance) {
        if (!instance.id) instance.id = uuidv4();
      }
    }
  }
);

export default CoinTransaction;
