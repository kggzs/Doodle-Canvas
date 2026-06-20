// -*- coding: utf-8 -*-
/**
 * 运行期环境变量补全
 * - 从 server/.runtime.env 加载自动生成的密钥
 * - 缺少 JWT/AES 密钥时自动生成并持久化，避免每次重启变更
 */
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '../..');
const GENERATED_ENV_FILE = path.join(SERVER_ROOT, '.runtime.env');
const NODE_ENV = process.env.NODE_ENV || 'development';
const GENERATED_HEADER = [
  '# Doodle-Canvas 自动生成配置',
  '# 这个文件由服务端启动时生成，用于保存本地运行密钥。',
  '# 不需要手动编辑，也不要提交到版本库。'
].join(os.EOL);

function parseEnvContent(content) {
  const parsed = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function readGeneratedEnv() {
  if (!fs.existsSync(GENERATED_ENV_FILE)) return {};
  return parseEnvContent(fs.readFileSync(GENERATED_ENV_FILE, 'utf8'));
}

function writeGeneratedEnv(values) {
  const lines = [GENERATED_HEADER, ''];
  for (const [key, value] of Object.entries(values)) {
    lines.push(`${key}=${value}`);
  }
  lines.push('');
  fs.writeFileSync(GENERATED_ENV_FILE, lines.join(os.EOL), 'utf8');
}

function randomBase64Url(bytes) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function makeJwtSecret() {
  return `dc_jwt_${randomBase64Url(48)}`;
}

function makeAesSecretKey() {
  return randomBase64Url(24);
}

function isValidJwtSecret(value) {
  return Boolean(value) && Buffer.byteLength(value, 'utf8') >= 32;
}

function isValidAesSecretKey(value) {
  return Boolean(value) && Buffer.byteLength(value, 'utf8') === 32;
}

function shouldAutoReplaceInvalid() {
  return NODE_ENV !== 'production';
}

function applyGeneratedSecret(key, isValid, generatedValues) {
  const generatedValue = generatedValues[key];
  if (!isValid(generatedValue)) return;

  if (!process.env[key] || (shouldAutoReplaceInvalid() && !isValid(process.env[key]))) {
    process.env[key] = generatedValue;
  }
}

function ensureSecret(key, createValue, isValid, generatedValues, generatedKeys) {
  if (isValid(process.env[key])) return;

  if (process.env[key] && !shouldAutoReplaceInvalid()) {
    throw new Error(`${key} 配置不合法，请删除该项让服务自动生成，或手动配置有效值`);
  }

  const value = createValue();
  process.env[key] = value;
  generatedValues[key] = value;
  generatedKeys.push(key);
}

const generatedValues = readGeneratedEnv();
const generatedKeys = [];

applyGeneratedSecret('JWT_SECRET', isValidJwtSecret, generatedValues);
applyGeneratedSecret('AES_SECRET_KEY', isValidAesSecretKey, generatedValues);

ensureSecret('JWT_SECRET', makeJwtSecret, isValidJwtSecret, generatedValues, generatedKeys);
ensureSecret('AES_SECRET_KEY', makeAesSecretKey, isValidAesSecretKey, generatedValues, generatedKeys);

if (generatedKeys.length > 0) {
  writeGeneratedEnv(generatedValues);
}

export const runtimeEnv = {
  generatedEnvFile: GENERATED_ENV_FILE,
  generatedKeys
};

export default runtimeEnv;
