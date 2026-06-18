// -*- coding: utf-8 -*-
/**
 * Project 项目模型
 * 对应数据库表：projects
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

const Project = sequelize.define(
  'Project',
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
    name: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    },
    canvasData: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      field: 'canvas_data',
      get() {
        return parseJson(this.getDataValue('canvasData'), {});
      },
      set(value) {
        this.setDataValue('canvasData', stringifyJson(value) || '{}');
      }
    },
    thumbnailFileId: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'thumbnail_file_id'
    },
    nodeCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'node_count'
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_public'
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
    tableName: 'projects',
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

export default Project;
