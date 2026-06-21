// -*- coding: utf-8 -*-
/**
 * 回填历史生成媒体文件
 * - 将 generation_records.result 中的远程/内联生成结果保存到本地 storage
 * - 更新生成记录与项目画布中的旧 URL
 *
 * 用法：
 *   node src/scripts/backfill-generated-files.js
 *   node src/scripts/backfill-generated-files.js --dry-run --limit=20
 */
import 'dotenv/config';
import { Op } from 'sequelize';

import db from '../models/index.js';
import * as StorageService from '../services/storage.js';
import { recordError } from '../services/error-logs.js';

const { File, GenerationRecord, Project } = db;

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(parseInt(limitArg.split('=')[1], 10) || 0, 0) : 0;

function isLocalStorageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const value = url.trim();
  const storageBase = StorageService.getStorageBaseUrl();
  if (value.startsWith('/storage/')) return true;
  if (storageBase && value.startsWith(`${storageBase}/`)) return true;
  try {
    const parsed = new URL(value);
    return parsed.pathname.startsWith('/storage/');
  } catch {
    return false;
  }
}

function isPersistableUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const value = url.trim();
  if (isLocalStorageUrl(value)) return false;
  return value.startsWith('data:') || /^https?:\/\//i.test(value);
}

function collectResultMedia(record, resultPayload = record.result) {
  const result = resultPayload;
  if (!result || typeof result !== 'object') return [];

  if (record.type === 'image') {
    return (Array.isArray(result.images) ? result.images : [])
      .filter((item) => isPersistableUrl(item?.url))
      .map((item) => ({ item, url: item.url, storageType: 'generated_image' }));
  }

  if (record.type === 'video' && isPersistableUrl(result.url)) {
    return [{ item: result, url: result.url, storageType: 'generated_video' }];
  }

  return [];
}

function replaceUrlDeep(value, replacements) {
  if (!value || !replacements.size) return { value, changed: false };
  if (typeof value === 'string') {
    const replacement = replacements.get(value);
    return replacement ? { value: replacement, changed: true } : { value, changed: false };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const replaced = replaceUrlDeep(item, replacements);
      changed ||= replaced.changed;
      return replaced.value;
    });
    return { value: next, changed };
  }
  if (typeof value === 'object') {
    let changed = false;
    const next = {};
    for (const [key, child] of Object.entries(value)) {
      const replaced = replaceUrlDeep(child, replacements);
      changed ||= replaced.changed;
      next[key] = replaced.value;
    }
    return { value: next, changed };
  }
  return { value, changed: false };
}

async function updateProjectCanvas(record, replacements) {
  if (!replacements.size) return 0;
  const where = record.projectId
    ? { id: record.projectId }
    : { userId: record.userId };
  const projects = await Project.findAll({ where });
  let updated = 0;

  for (const project of projects) {
    const replaced = replaceUrlDeep(project.canvasData, replacements);
    if (!replaced.changed) continue;
    if (!dryRun) {
      await project.update({ canvasData: replaced.value });
    }
    updated += 1;
  }

  return updated;
}

async function backfillRecord(record) {
  const resultPayload = record.result;
  const mediaItems = collectResultMedia(record, resultPayload);
  if (!mediaItems.length) return { changed: false, files: 0, projects: 0 };

  const replacements = new Map();
  const fileCache = new Map();
  let fileCount = 0;

  for (const media of mediaItems) {
    let file = fileCache.get(media.url);
    if (!file && !dryRun) {
      file = await StorageService.persistRemoteFile({
        url: media.url,
        userId: record.userId,
        generationId: record.id,
        type: media.storageType
      });
      fileCache.set(media.url, file);
    }

    if (dryRun) {
      replacements.set(media.url, `/storage/${media.storageType}/dry-run`);
    } else {
      replacements.set(media.url, file.fileUrl);
      media.item.url = file.fileUrl;
      media.item.file_id = file.id;
      media.item.fileName = file.fileName;
      if (!String(media.url).startsWith('data:')) {
        media.item.originalUrl = media.item.originalUrl || media.url;
      }
    }
    fileCount += 1;
  }

  if (!dryRun) {
    await record.update({ result: resultPayload });
  }

  const projects = await updateProjectCanvas(record, replacements);
  return { changed: true, files: fileCount, projects };
}

async function run() {
  await db.sequelize.authenticate();

  const records = await GenerationRecord.findAll({
    where: {
      status: 'completed',
      type: { [Op.in]: ['image', 'video'] }
    },
    include: [
      {
        model: File,
        as: 'files',
        required: false,
        attributes: ['id']
      }
    ],
    order: [['createdAt', 'DESC']],
    ...(limit ? { limit } : {})
  });

  let scanned = 0;
  let changed = 0;
  let files = 0;
  let projects = 0;
  let failed = 0;

  for (const record of records) {
    scanned += 1;
    const mediaItems = collectResultMedia(record);
    if (!mediaItems.length) continue;

    try {
      const result = await backfillRecord(record);
      if (result.changed) {
        changed += 1;
        files += result.files;
        projects += result.projects;
        console.log(`${dryRun ? '[dry-run] ' : ''}backfilled record ${record.id}: media=${result.files}, projects=${result.projects}`);
      }
    } catch (err) {
      failed += 1;
      console.error(`failed record ${record.id}: ${err.message}`);
      await recordError({
        scope: 'maintenance',
        level: 'error',
        code: 50201,
        httpStatus: 502,
        userId: record.userId,
        message: err.message,
        publicMessage: '历史生成文件回填失败',
        stack: err.stack || null,
        details: {
          generation_id: record.id,
          type: record.type,
          urls: mediaItems.map((item) => item.url)
        }
      });
    }
  }

  console.log(`done: scanned=${scanned}, changed=${changed}, files=${files}, projects=${projects}, failed=${failed}, dryRun=${dryRun}`);
  await db.sequelize.close();
}

run().catch(async (err) => {
  console.error(err);
  try {
    await db.sequelize.close();
  } catch {
    // ignore close errors during script shutdown
  }
  process.exit(1);
});
