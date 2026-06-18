// -*- coding: utf-8 -*-
/**
 * SystemSetting 系统设置模型
 * 对应数据库表：system_settings
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const SystemSetting = sequelize.define(
  'SystemSetting',
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    key: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    value: {
      type: DataTypes.TEXT('medium'),
      allowNull: true,
      defaultValue: null
    },
    valueType: {
      type: DataTypes.ENUM('string', 'number', 'boolean', 'json', 'secret'),
      allowNull: false,
      defaultValue: 'string',
      field: 'value_type'
    },
    category: {
      type: DataTypes.ENUM('site', 'registration', 'billing', 'model', 'storage', 'security', 'email', 'risk', 'content'),
      allowNull: false,
      defaultValue: 'site'
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_public'
    },
    isEditable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_editable'
    },
    updatedBy: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'updated_by'
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
    tableName: 'system_settings',
    timestamps: true,
    underscored: true,
    freezeTableName: true
  }
);

export default SystemSetting;
