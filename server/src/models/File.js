// -*- coding: utf-8 -*-
/**
 * File 文件模型
 * 对应数据库表：files
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

const File = sequelize.define(
  'File',
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
    generationId: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'generation_id'
    },
    type: {
      type: DataTypes.ENUM('upload', 'generated_image', 'generated_video', 'thumbnail'),
      allowNull: false
    },
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'file_name'
    },
    storagePath: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'storage_path'
    },
    fileUrl: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'file_url'
    },
    fileSize: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'file_size'
    },
    mimeType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'mime_type'
    },
    width: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null
    },
    height: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null
    },
    duration: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: null
    },
    sha256: {
      type: DataTypes.CHAR(64),
      allowNull: true,
      defaultValue: null
    },
    status: {
      type: DataTypes.ENUM('active', 'deleted', 'quarantined'),
      allowNull: false,
      defaultValue: 'active'
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'deleted_at'
    },
    deletedBy: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'deleted_by'
    },
    deletedByType: {
      type: DataTypes.ENUM('user', 'admin', 'system'),
      allowNull: true,
      defaultValue: null,
      field: 'deleted_by_type'
    },
    deleteReason: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
      field: 'delete_reason'
    },
    relatedReviewId: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'related_review_id'
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
    tableName: 'files',
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

export default File;
