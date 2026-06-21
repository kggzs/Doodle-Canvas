// -*- coding: utf-8 -*-
/**
 * 文件名规范化工具
 */
import path from 'path';
import crypto from 'crypto';

const MAX_FILE_NAME_LENGTH = 255;
const REPLACEMENT_CHARACTER = '\uFFFD';
const LATIN1_MOJIBAKE_SIGNAL_RE = /[\u0080-\u009f]|[ÃÂÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function stripUnsafeNameParts(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .pop() || '';
}

function hasMojibakeSignal(value) {
  return LATIN1_MOJIBAKE_SIGNAL_RE.test(value);
}

function decodeLatin1Mojibake(value) {
  if (!hasMojibakeSignal(value)) return value;

  const decoded = Buffer.from(value, 'latin1').toString('utf8');
  if (!decoded || decoded === value || decoded.includes(REPLACEMENT_CHARACTER)) {
    return value;
  }
  return decoded;
}

function truncateFileName(value) {
  const chars = Array.from(value);
  if (chars.length <= MAX_FILE_NAME_LENGTH) return value;

  const ext = path.extname(value);
  const extChars = Array.from(ext);
  if (ext && extChars.length < MAX_FILE_NAME_LENGTH - 1) {
    return `${chars.slice(0, MAX_FILE_NAME_LENGTH - extChars.length).join('')}${ext}`;
  }
  return chars.slice(0, MAX_FILE_NAME_LENGTH).join('');
}

export function normalizeOriginalFileName(originalName) {
  const baseName = stripUnsafeNameParts(originalName)
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();

  if (!baseName) return null;
  return truncateFileName(decodeLatin1Mojibake(baseName));
}

export function createTimestampFileName(ext = '') {
  const date = new Date();
  const safeExt = ext && String(ext).startsWith('.') ? String(ext).toLowerCase() : '';
  const readableTime = [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate())
  ].join('')
    + '_'
    + [
      pad2(date.getHours()),
      pad2(date.getMinutes()),
      pad2(date.getSeconds())
    ].join('');
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 6);

  return `${readableTime}_${date.getTime()}_${random}${safeExt}`;
}

export default {
  normalizeOriginalFileName,
  createTimestampFileName
};
