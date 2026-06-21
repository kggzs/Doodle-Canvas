// -*- coding: utf-8 -*-
/**
 * 本地文件存储服务
 * - 按类型/年月分目录写入磁盘
 * - 写 files 表
 * - 用户删除为软删除，物理文件保留
 */
import crypto from 'crypto';
import dns from 'dns/promises';
import fs from 'fs/promises';
import http from 'http';
import https from 'https';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

import axios from 'axios';
import multer from 'multer';
import sharp from 'sharp';
import { Op } from 'sequelize';

import db from '../models/index.js';

const { File, GenerationRecord, ModelChannel, ModelConfig, Project, User } = db;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_STORAGE_ROOT = path.resolve(SERVER_ROOT, 'storage');
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm']);
const STORAGE_MAX_UPLOAD_BYTES = parseInt(process.env.STORAGE_MAX_UPLOAD_BYTES || `${20 * 1024 * 1024}`, 10);
const STORAGE_REMOTE_MAX_BYTES = parseInt(process.env.STORAGE_REMOTE_MAX_BYTES || `${100 * 1024 * 1024}`, 10);
const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm'
};
const REMOTE_ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const safeAgentLookup = (hostname, options, callback) => {
  const directIpVersion = net.isIP(hostname);
  if (directIpVersion) {
    if (isPrivateIp(hostname)) {
      callback(new StorageError(42201, '远程文件 URL 指向受限地址'));
      return;
    }
    if (options?.all) {
      callback(null, [{ address: hostname, family: directIpVersion }]);
      return;
    }
    callback(null, hostname, directIpVersion);
    return;
  }

  dns.lookup(hostname, { ...options, verbatim: false })
    .then((result) => {
      const addresses = Array.isArray(result) ? result : [result];
      if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) {
        throw new StorageError(42201, '远程文件 URL 指向受限地址');
      }
      if (options?.all) {
        callback(null, addresses);
        return;
      }
      callback(null, addresses[0].address, addresses[0].family);
    })
    .catch((err) => callback(err));
};
export const SAFE_HTTP_AGENT = new http.Agent({ family: 4, lookup: safeAgentLookup });
export const SAFE_HTTPS_AGENT = new https.Agent({ family: 4, lookup: safeAgentLookup });
const REMOTE_HEADERS = {
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,video/*,*/*;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  Referer: process.env.FRONTEND_BASE || 'http://localhost:3000/'
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
    fileSize: STORAGE_MAX_UPLOAD_BYTES
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

export function normalizeStoragePath(storagePath = '') {
  const normalized = String(storagePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..' || part.includes('\0'))) {
    throw new StorageError(40001, '文件路径不正确');
  }
  return path.posix.join(...parts);
}

export function resolveStorageFilePath(storagePath) {
  const normalized = normalizeStoragePath(storagePath);
  const root = getStorageRoot();
  const absolutePath = path.resolve(root, normalized);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new StorageError(40001, '文件路径不正确');
  }
  return absolutePath;
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

function detectMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.subarray(0, 3).toString('ascii') === 'GIF') {
    return 'image/gif';
  }
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    return 'video/mp4';
  }
  if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return 'video/webm';
  }
  return null;
}

function sniffMimeType(buffer, fallback = 'application/octet-stream') {
  return detectMimeType(buffer) || fallback;
}

function maxBytesForType(type) {
  return type === 'upload' || type === 'thumbnail'
    ? STORAGE_MAX_UPLOAD_BYTES
    : STORAGE_REMOTE_MAX_BYTES;
}

function validateBufferForStorage(buffer, requestedMimeType, type) {
  const limit = maxBytesForType(type);
  if (buffer.length > limit) {
    throw new StorageError(42201, `文件大小超过限制（最大 ${Math.round(limit / 1024 / 1024)}MB）`);
  }

  const detectedMimeType = detectMimeType(buffer);
  const normalizedRequested = String(requestedMimeType || 'application/octet-stream').split(';')[0].trim().toLowerCase();

  if (type === 'upload' || type === 'thumbnail' || type === 'generated_image') {
    if (!detectedMimeType || !IMAGE_MIME_TYPES.has(detectedMimeType)) {
      throw new StorageError(42201, '文件内容不是受支持的图片格式');
    }
    return detectedMimeType;
  }

  if (type === 'generated_video') {
    if (!detectedMimeType || !VIDEO_MIME_TYPES.has(detectedMimeType)) {
      throw new StorageError(42201, '文件内容不是受支持的视频格式');
    }
    return detectedMimeType;
  }

  return detectedMimeType || normalizedRequested;
}

function assertMimeMatchesType(mimeType, type) {
  if (type === 'generated_image' && !IMAGE_MIME_TYPES.has(mimeType)) {
    throw new StorageError(50201, `生成图片转存失败：远程文件不是图片（${mimeType || 'unknown'}）`);
  }
  if (type === 'generated_video' && !VIDEO_MIME_TYPES.has(mimeType)) {
    throw new StorageError(50201, `生成视频转存失败：远程文件不是视频（${mimeType || 'unknown'}）`);
  }
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

function isPrivateIp(ip) {
  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map((part) => Number(part));
    const [a, b] = parts;
    const blockBenchmarkIps = process.env.STORAGE_BLOCK_BENCHMARK_IPS === 'true';
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0)
      || (blockBenchmarkIps && a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower.startsWith('::ffff:')) {
      const mapped = lower.slice(7);
      return net.isIP(mapped) === 4 ? isPrivateIp(mapped) : true;
    }
    return lower === '::'
      || lower === '::1'
      || lower.startsWith('fc')
      || lower.startsWith('fd')
      || lower.startsWith('fe80:')
      || lower.startsWith('ff');
  }
  return true;
}

export async function assertSafeRemoteUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new StorageError(42201, '远程文件 URL 格式不正确');
  }

  if (!REMOTE_ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new StorageError(42201, '远程文件 URL 仅支持 HTTP/HTTPS');
  }
  if (parsed.username || parsed.password) {
    throw new StorageError(42201, '远程文件 URL 不允许包含认证信息');
  }

  const directIpVersion = net.isIP(parsed.hostname);
  const addresses = directIpVersion
    ? [{ address: parsed.hostname }]
    : await dns.lookup(parsed.hostname, { all: true, verbatim: false });

  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) {
    throw new StorageError(42201, '远程文件 URL 指向受限地址');
  }

  return parsed.toString();
}

async function downloadRemoteFile(url) {
  const maxRedirects = Math.min(Math.max(parseInt(process.env.STORAGE_REMOTE_MAX_REDIRECTS || '3', 10), 0), 5);
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    currentUrl = await assertSafeRemoteUrl(currentUrl);
    const response = await axios.get(currentUrl, {
      responseType: 'arraybuffer',
      httpAgent: SAFE_HTTP_AGENT,
      httpsAgent: SAFE_HTTPS_AGENT,
      timeout: parseInt(process.env.STORAGE_REMOTE_DOWNLOAD_TIMEOUT_MS || '60000', 10),
      maxContentLength: STORAGE_REMOTE_MAX_BYTES,
      maxBodyLength: STORAGE_REMOTE_MAX_BYTES,
      maxRedirects: 0,
      headers: REMOTE_HEADERS,
      validateStatus: () => true
    });

    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      currentUrl = new URL(response.headers.location, currentUrl).toString();
      continue;
    }

    if (response.status >= 400 || response.status >= 300) {
      throw new StorageError(50201, `远程文件下载失败：HTTP ${response.status}`);
    }

    const buffer = Buffer.from(response.data);
    const headerContentType = String(response.headers['content-type'] || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    return {
      buffer,
      mimeType: sniffMimeType(buffer, headerContentType)
    };
  }

  throw new StorageError(50201, '远程文件下载重定向次数过多');
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
  const safeMimeType = validateBufferForStorage(buffer, mimeType, type);

  const { year, month } = nowParts();
  const dirType = type === 'upload' ? 'uploads' : type.replace(/^generated_/, 'generated/');
  const relativeDir = path.posix.join(dirType, year, month);
  const absoluteDir = path.join(getStorageRoot(), relativeDir);
  await ensureDir(absoluteDir);

  const ext = guessExt(safeMimeType, originalName);
  const fileName = `${crypto.randomUUID()}${ext}`;
  const storagePath = path.posix.join(relativeDir, fileName);
  const absolutePath = path.join(getStorageRoot(), storagePath);
  await fs.writeFile(absolutePath, buffer);

  const imageMeta = await getImageMetadata(buffer, safeMimeType);
  return File.create({
    userId,
    generationId,
    type,
    fileName: originalName || fileName,
    storagePath,
    fileUrl: buildFileUrl(storagePath),
    fileSize: buffer.length,
    mimeType: safeMimeType,
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
  assertMimeMatchesType(downloaded.mimeType, type);
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

export async function getPublicFileByStoragePath(storagePath) {
  const normalized = normalizeStoragePath(storagePath);
  const file = await File.findOne({
    where: {
      storagePath: normalized,
      status: 'active'
    }
  });
  if (!file) throw new StorageError(40402, '文件不存在或已删除');
  return {
    file,
    absolutePath: resolveStorageFilePath(file.storagePath)
  };
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
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'email'],
        required: false
      },
      {
        model: GenerationRecord,
        as: 'generation',
        attributes: ['id', 'type', 'status', 'promptText', 'costAmount', 'projectId', 'createdAt'],
        required: false,
        include: [
          { model: Project, as: 'project', attributes: ['id', 'name'], required: false },
          { model: ModelConfig, as: 'model', attributes: ['id', 'modelKey', 'displayName', 'modelType'], required: false },
          { model: ModelChannel, as: 'channel', attributes: ['id', 'name', 'providerType'], required: false }
        ]
      }
    ],
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });

  return { items: rows, total: count, page, pageSize };
}

export default {
  StorageError,
  uploadImageMiddleware,
  getStorageRoot,
  getStorageBaseUrl,
  normalizeStoragePath,
  resolveStorageFilePath,
  saveBuffer,
  saveDataUrl,
  persistRemoteFile,
  getFileForUser,
  getPublicFileByStoragePath,
  softDeleteFile,
  restoreFile,
  listFiles
};
