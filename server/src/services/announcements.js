// -*- coding: utf-8 -*-
/**
 * 公告服务
 */
import { Op } from 'sequelize';

import db from '../models/index.js';

const { Announcement, User } = db;
const STATUSES = ['draft', 'published', 'archived'];

export class AnnouncementError extends Error {
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

function sanitize(model) {
  if (!model) return null;
  return typeof model.toJSON === 'function' ? model.toJSON() : { ...model };
}

function ensureStatus(status) {
  if (status !== undefined && status !== null && !STATUSES.includes(status)) {
    throw new AnnouncementError(42201, '公告状态不支持');
  }
}

function payloadFrom(data = {}, operatorId = null) {
  const payload = {};
  if (data.title !== undefined) payload.title = String(data.title || '').trim();
  if (data.content !== undefined) payload.content = String(data.content || '').trim();
  if (data.status !== undefined) {
    ensureStatus(data.status);
    payload.status = data.status;
    if (data.status === 'published' && data.publishedAt === undefined && data.published_at === undefined) {
      payload.publishedAt = new Date();
    }
  }
  if (data.priority !== undefined) payload.priority = parseInt(data.priority, 10) || 0;
  if (data.publishedAt !== undefined || data.published_at !== undefined) {
    const value = data.publishedAt ?? data.published_at;
    payload.publishedAt = value ? new Date(value) : null;
  }
  if (operatorId !== null) payload.createdBy = operatorId;
  return payload;
}

async function requireAnnouncement(id, options = {}) {
  const announcement = await Announcement.findByPk(id, options);
  if (!announcement) {
    throw new AnnouncementError(40401, '公告不存在');
  }
  return announcement;
}

export async function listAnnouncements(params = {}) {
  const { page, pageSize, offset } = normalizePage(params.page, params.pageSize);
  const where = {};
  if (params.status) {
    ensureStatus(params.status);
    where.status = params.status;
  }
  if (params.keyword) {
    where[Op.or] = [
      { title: { [Op.like]: `%${params.keyword}%` } },
      { content: { [Op.like]: `%${params.keyword}%` } }
    ];
  }

  const { rows, count } = await Announcement.findAndCountAll({
    where,
    include: [{ model: User, as: 'creator', attributes: ['id', 'username', 'email'], required: false }],
    order: [
      ['priority', 'DESC'],
      ['publishedAt', 'DESC'],
      ['createdAt', 'DESC']
    ],
    limit: pageSize,
    offset
  });

  return {
    items: rows.map(sanitize),
    total: count,
    page,
    pageSize
  };
}

export async function createAnnouncement(data = {}, operatorId = null) {
  const payload = payloadFrom(data, operatorId);
  if (!payload.title || !payload.content) {
    throw new AnnouncementError(42201, '公告标题和内容不能为空');
  }
  const announcement = await Announcement.create(payload);
  return sanitize(announcement);
}

export async function updateAnnouncement(id, data = {}) {
  const announcement = await requireAnnouncement(id);
  const payload = payloadFrom(data);
  if (payload.title === '') throw new AnnouncementError(42201, '公告标题不能为空');
  if (payload.content === '') throw new AnnouncementError(42201, '公告内容不能为空');
  await announcement.update(payload);
  return sanitize(await announcement.reload({
    include: [{ model: User, as: 'creator', attributes: ['id', 'username', 'email'], required: false }]
  }));
}

export async function deleteAnnouncement(id) {
  const announcement = await requireAnnouncement(id);
  await announcement.destroy();
  return { deleted: true };
}

export async function listLatestPublished(limit = 5) {
  const items = await Announcement.findAll({
    where: {
      status: 'published',
      [Op.or]: [
        { publishedAt: null },
        { publishedAt: { [Op.lte]: new Date() } }
      ]
    },
    order: [
      ['priority', 'DESC'],
      ['publishedAt', 'DESC'],
      ['createdAt', 'DESC']
    ],
    limit: Math.min(Math.max(parseInt(limit, 10) || 5, 1), 10)
  });
  return items.map(sanitize);
}

export async function getPublishedAnnouncement(id) {
  const announcement = await Announcement.findOne({
    where: {
      id,
      status: 'published',
      [Op.or]: [
        { publishedAt: null },
        { publishedAt: { [Op.lte]: new Date() } }
      ]
    }
  });
  if (!announcement) {
    throw new AnnouncementError(40401, '公告不存在或未发布');
  }
  return sanitize(announcement);
}

export default {
  AnnouncementError,
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  listLatestPublished,
  getPublishedAnnouncement
};
