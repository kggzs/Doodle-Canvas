// -*- coding: utf-8 -*-
/**
 * UserBalance 用户金币余额模型
 * 对应数据库表：user_balances
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

const UserBalance = sequelize.define(
  'UserBalance',
  {
    id: {
      type: DataTypes.CHAR(36),
      primaryKey: true,
      allowNull: false
    },
    userId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      unique: true,
      field: 'user_id'
    },
    balance: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    },
    coinsFrozen: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'coins_frozen'
    },
    totalRecharged: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'total_recharged'
    },
    totalGifted: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'total_gifted'
    },
    totalConsumed: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'total_consumed'
    },
    totalRefunded: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'total_refunded'
    },
    totalExpired: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'total_expired'
    },
    lastTransactionAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'last_transaction_at'
    },
    lowBalanceAlert: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'low_balance_alert'
    },
    lowBalanceThreshold: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 1,
      field: 'low_balance_threshold'
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
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
    tableName: 'user_balances',
    timestamps: true,
    underscored: true,
    freezeTableName: true,
    hooks: {
      beforeValidate(instance) {
        if (!instance.id) instance.id = uuidv4();
      }
    }
  }
);

export default UserBalance;
