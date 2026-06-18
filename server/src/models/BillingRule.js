// -*- coding: utf-8 -*-
/**
 * BillingRule 计费规则模型
 * 对应数据库表：billing_rules
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

const BillingRule = sequelize.define(
  'BillingRule',
  {
    id: {
      type: DataTypes.CHAR(36),
      primaryKey: true,
      allowNull: false
    },
    modelId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      unique: true,
      field: 'model_id'
    },
    ruleType: {
      type: DataTypes.ENUM('fixed', 'param_tiered'),
      allowNull: false,
      defaultValue: 'fixed',
      field: 'rule_type'
    },
    fixedAmount: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0,
      field: 'fixed_amount'
    },
    paramRules: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      defaultValue: null,
      field: 'param_rules',
      get() {
        return parseJson(this.getDataValue('paramRules'));
      },
      set(value) {
        this.setDataValue('paramRules', stringifyJson(value));
      }
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active'
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
    tableName: 'billing_rules',
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

export default BillingRule;
