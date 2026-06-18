// -*- coding: utf-8 -*-
/**
 * UserGroupMember 用户-组关系模型
 * 对应数据库表：user_group_members
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

const UserGroupMember = sequelize.define(
  'UserGroupMember',
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
    groupId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      field: 'group_id'
    },
    joinedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'joined_at'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'expires_at'
    },
    grantedBy: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      defaultValue: null,
      field: 'granted_by'
    },
    grantReason: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
      field: 'grant_reason'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  },
  {
    tableName: 'user_group_members',
    timestamps: true,
    updatedAt: false,
    underscored: true,
    freezeTableName: true,
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'group_id']
      }
    ],
    hooks: {
      beforeValidate(instance) {
        if (!instance.id) instance.id = uuidv4();
      }
    }
  }
);

export default UserGroupMember;
