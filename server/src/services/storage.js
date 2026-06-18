// -*- coding: utf-8 -*-
/**
 * 本地文件存储服务
 * - 按类型/年月分目录写入磁盘
 * - 写 files 表
 * - 用户删除为软删除，物理文件保留
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import axios from 'axios';
import multer from 'multer';
import sharp from 'sharp';
import { Op } from 'sequelize';

import db from '../models/index.js';

const { File } = db;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_STORAGE_ROOT = path.resolve(SERVER_ROOT, 'storage');
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm'
};

export class StorageError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

export const uploadImageMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.STORAGE_MAX_UPLOAD_BYTES || `${20 * 1024 * 1024}`, 10)
  },
  fileFilter(req, file, cb) {
    if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(new StorageError(42201, '仅支持 PNG/JPEG/WebP/GIF 图片'));
      return;
    }
    cb(null, true);
  }
});

export function getStorageRoot() {
  return path.resolve(process.env.STORAGE_ROOT || DEFAULT_STORAGE_ROOT);
}

export function getStorageBaseUrl() {
  return (process.env.STORAGE_BASE_URL || '/storage').replace(/\/+$/, '');
}

function nowParts() {
  const date = new Date();
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, '0')
  };
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function guessExt(mimeType, fallbackName = '') {
  if (EXT_BY_MIME[mimeType]) return EXT_BY_MIME[mimeType];
  const ext = path.extname(fallbackName || '').toLowerCase();
  return ext || '.bin';
}

function buildFileUrl(storagePath) {
  const normalized = storagePath.replace(/\\/g, '/');
  const base = getStorageBaseUrl();
  return `${base}/${normalized}`.replace(/([^:]\/)\/+/g, '$1');
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function getImageMetadata(buffer, mimeType) {
  if (!IMAGE_MIME_TYPES.has(mimeType)) return {};
  try {
    const meta = await sharp(buffer).metadata();
    return {
      width: meta.width || null,
      height: meta.height || null
    };
  } catch {
    return {};
  }
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl || '');
  if (!match) {
    throw new StorageError(42201, 'data URL 格式不正确');
  }
  return {
    mimeType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64')
  };
}

async function downloadRemoteFile(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: parseInt(process.env.STORAGE_REMOTE_DOWNLOAD_TIMEOUT_MS || '60000', 10),
    maxContentLength: parseInt(process.env.STORAGE_REMOTE_MAX_BYTES || `${100 * 1024 * 1024}`, 10),
    validateStatus: () => true
  });

  if (response.status >= 400) {
    throw new StorageError(50201, `远程文件下载失败：HTTP ${response.status}`);
  }

  const contentType = String(response.headers['content-type'] || 'application/octet-stream').split(';')[0].trim();
  return {
    buffer: Buffer.from(response.data),
    mimeType: contentType
  };
}

export async function saveBuffer({
  buffer,
  userId,
  generationId = null,
  type = 'upload',
  originalName = null,
  mimeType = 'application/octet-stream'
}) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new StorageError(42201, '文件内容不能为空');
  }
  if (!userId) {
    throw new StorageError(40101, '缺少用户信息');
  }

  const { year, month } = nowParts();
  const dirType = type === 'upload' ? 'uploads' : type.replace(/^generated_/, 'generated/');
  const relativeDir = path.posix.join(dirType, year, month);
  const absoluteDir = path.join(getStorageRoot(), relativeDir);
  await ensureDir(absoluteDir);

  const ext = guessExt(mimeType, originalName);
  const fileName = `${crypto.randomUUID()}${ext}`;
  const storagePath = path.posix.join(relativeDir, fileName);
  const absolutePath = path.join(getStorageRoot(), storagePath);
  await fs.writeFile(absolutePath, buffer);

  const imageMeta = await getImageMetadata(buffer, mimeType);
  return File.create({
    userId,
    generationId,
    type,
    fileName: originalName || fileName,
    storagePath,
    fileUrl: buildFileUrl(storagePath),
    fileSize: buffer.length,
    mimeType,
    sha256: sha256(buffer),
    ...imageMeta
  });
}

export async function saveDataUrl({ dataUrl, userId, generationId = null, type = 'upload', originalName = null }) {
  const parsed = parseDataUrl(dataUrl);
  return saveBuffer({
    buffer: parsed.buffer,
    mimeType: parsed.mimeType,
    userId,
    generationId,
    type,
    originalName
  });
}

export async function persistRemoteFile({ url, userId, generationId = null, type = 'generated_image', originalName = null }) {
  if (!url) throw new StorageError(42201, '文件 URL 不能为空');
  if (url.startsWith('data:')) {
    return saveDataUrl({ dataUrl: url, userId, generationId, type, originalName });
  }

  const downloaded = await downloadRemoteFile(url);
  return saveBuffer({
    buffer: downloaded.buffer,
    mimeType: downloaded.mimeType,
    userId,
    generationId,
    type,
    originalName: originalName || path.basename(new URL(url).pathname)
  });
}

export async function getFileForUser(id, userId) {
  const file = await File.findOne({
    where: {
      id,
      userId,
      status: 'active'
    }
  });
  if (!file) throw new StorageError(40402, '文件不存在或已删除');
  return file;
}

export async function softDeleteFile(id, userId, { deletedByType = 'user', reason = null } = {}) {
  const file = await File.findOne({ where: { id, userId } });
  if (!file) throw new StorageError(40402, '文件不存在');
  if (file.status === 'deleted') {
    throw new StorageError(40901, '文件已删除，不能重复删除');
  }

  await file.update({
    status: 'deleted',
    deletedAt: new Date(),
    deletedBy: userId,
    deletedByType,
    deleteReason: reason || '用户删除'
  });

  return file;
}

export async function restoreFile(id) {
  const file = await File.findByPk(id);
  if (!file) throw new StorageError(40402, '文件不存在');
  if (file.status !== 'deleted') return file;

  await file.update({
    status: 'active',
    deletedAt: null,
    deletedBy: null,
    deletedByType: null,
    deleteReason: null
  });
  return file;
}

export async function listFiles(params = {}) {
  const pageSize = Math.min(Math.max(parseInt(params.pageSize, 10) || 20, 1), 100);
  const page = Math.max(parseInt(params.page, 10) || 1, 1);
  const where = {};

  if (params.userId) where.userId = params.userId;
  if (params.status) where.status = params.status;
  if (params.type) where.type = params.type;
  if (params.keyword) {
    where[Op.or] = [
      { fileName: { [Op.like]: `%${params.keyword}%` } },
      { storagePath: { [Op.like]: `%${params.keyword}%` } },
      { fileUrl: { [Op.like]: `%${params.keyword}%` } }
    ];
  }

  const { rows, count } = await File.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize
  });

  return { items: rows, total: count, page, pageSize };
}

export default {
  StorageError,
  uploadImageMiddleware,
  getStorageRoot,
  getStorageBaseUrl,
  saveBuffer,
  saveDataUrl,
  persistRemoteFile,
  getFileForUser,
  softDeleteFile,
  restoreFile,
  listFiles
};
