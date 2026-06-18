// -*- coding: utf-8 -*-
/**
 * MigrateImport 本地数据迁移映射模型
 * 对应数据库表：migrate_imports
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const MigrateImport = sequelize.define(
  'MigrateImport',
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      field: 'user_id'
    },
    clientId: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'client_id'
    },
    projectId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      field: 'project_id'
    },
    importedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'imported_at'
    }
  },
  {
    tableName: 'migrate_imports',
    timestamps: false,
    underscored: true,
    freezeTableName: true,
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'client_id']
      }
    ]
  }
);

export default MigrateImport;
