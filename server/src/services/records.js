// -*- coding: utf-8 -*-
/**
 * 生成记录查询服务
 */
import { Op } from 'sequelize';

import db from '../models/index.js';

const { File, GenerationRecord, ModelChannel, ModelConfig, Project, User } = db;

export class RecordError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

function normalizePage(page = 1, pageSize = 20) {
  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  return {
    page: currentPage,
    pageSize: limit,
    offset: (currentPage - 1) * limit
  };
}

function buildWhere(params = {}) {
  const where = {};
  if (params.userId) where.userId = params.userId;
  if (params.type) where.type = params.type;
  if (params.status) where.status = params.status;
  if (params.reviewStatus) where.reviewStatus = params.reviewStatus;
  if (params.clientRequestId) {
    where.inputParams = {
      [Op.like]: `%"client_request_id":"${params.clientRequestId}"%`
    };
  }
  if (params.keyword) {
    where[Op.or] = [
      { promptText: { [Op.like]: `%${params.keyword}%` } },
      { errorMessage: { [Op.like]: `%${params.keyword}%` } }
    ];
  }
  return where;
}

export async function listUserRecords(userId, params = {}) {
  const { page, pageSize, offset } = normalizePage(params.page, params.pageSize);
  const where = buildWhere({ ...params, userId });
  where.isDeleted = false;

  const { rows, count } = await GenerationRecord.findAndCountAll({
    where,
    include: [
      { model: ModelConfig, as: 'model', attributes: ['id', 'modelKey', 'displayName', 'modelType'] },
      { model: ModelChannel, as: 'channel', attributes: ['id', 'name', 'providerType'] },
      { model: Project, as: 'project', attributes: ['id', 'name'], required: false },
      { model: File, as: 'files', where: { status: 'active' }, required: false }
    ],
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset,
    distinct: true
  });

  return { items: rows, total: count, page, pageSize };
}

export async function getUserRecord(userId, id) {
  const record = await GenerationRecord.findOne({
    where: { id, userId, isDeleted: false },
    include: [
      { model: ModelConfig, as: 'model', attributes: ['id', 'modelKey', 'displayName', 'modelType'] },
      { model: ModelChannel, as: 'channel', attributes: ['id', 'name', 'providerType'] },
      { model: Project, as: 'project', attributes: ['id', 'name'], required: false },
      { model: File, as: 'files', where: { status: 'active' }, required: false }
    ]
  });
  if (!record) throw new RecordError(40402, '生成记录不存在');
  return record;
}

export async function listAdminRecords(params = {}) {
  const { page, pageSize, offset } = normalizePage(params.page, params.pageSize);
  const where = buildWhere(params);

  const { rows, count } = await GenerationRecord.findAndCountAll({
    where,
    include: [
      { model: User, as: 'user', attributes: ['id', 'username', 'email'] },
      { model: ModelConfig, as: 'model', attributes: ['id', 'modelKey', 'displayName', 'modelType'] },
      { model: ModelChannel, as: 'channel', attributes: ['id', 'name', 'providerType'] },
      { model: Project, as: 'project', attributes: ['id', 'name'], required: false },
      { model: File, as: 'files', required: false }
    ],
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset,
    distinct: true
  });

  return { items: rows, total: count, page, pageSize };
}

export async function getAdminRecord(id) {
  const record = await GenerationRecord.findByPk(id, {
    include: [
      { model: User, as: 'user', attributes: ['id', 'username', 'email'] },
      { model: ModelConfig, as: 'model', attributes: ['id', 'modelKey', 'displayName', 'modelType'] },
      { model: ModelChannel, as: 'channel', attributes: ['id', 'name', 'providerType'] },
      { model: Project, as: 'project', attributes: ['id', 'name'], required: false },
      { model: File, as: 'files', required: false }
    ]
  });
  if (!record) throw new RecordError(40402, '生成记录不存在');
  return record;
}

export default {
  RecordError,
  listUserRecords,
  getUserRecord,
  listAdminRecords,
  getAdminRecord
};
