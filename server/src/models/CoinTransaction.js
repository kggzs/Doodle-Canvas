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
    txNo: {
      type: DataTypes.STRING(40),
      allowNull: false,
      unique: true,
      field: 'tx_no'
    },
    userId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      field: 'user_id'
    },
    type: {
      type: DataTypes.ENUM(
        'recharge',
        'recharge_bonus',
        'redeem',
        'gift',
        'register_gift',
        'consume',
        'refund',
        'adjust_add',
        'adjust_deduct',
        'freeze',
        'unfreeze',
        'forfeit',
        'expire',
        'transfer_in',
        'transfer_out',
        'rollback'
      ),
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
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'manual',
      field: 'ref_type'
    },
    refId: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'ref_id'
    },
    relatedTxId: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'related_tx_id'
    },
    reasonCode: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
      field: 'reason_code'
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: null
    },
    operatorId: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'operator_id'
    },
    operatorType: {
      type: DataTypes.ENUM('admin', 'user', 'system', 'cron'),
      allowNull: false,
      defaultValue: 'system',
      field: 'operator_type'
    },
    reason: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null
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
    costSnapshot: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      defaultValue: null,
      field: 'cost_snapshot',
      get() {
        return parseJson(this.getDataValue('costSnapshot'));
      },
      set(value) {
        this.setDataValue('costSnapshot', stringifyJson(value));
      }
    },
    isReversed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_reversed'
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
        if (!instance.txNo) {
          const time = Date.now().toString(36).toUpperCase();
          const random = uuidv4().replace(/-/g, '').slice(0, 10).toUpperCase();
          instance.txNo = `T${time}${random}`.slice(0, 40);
        }
      }
    }
  }
);

export default CoinTransaction;
