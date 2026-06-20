// -*- coding: utf-8 -*-
/**
 * AES-256-GCM 加解密工具
 * 用于 API Key 等敏感信息的加密存储
 * - 密钥从环境变量读取；缺少时由 runtime-env 自动生成并持久化
 * - 每次加密生成随机 IV，避免 GCM IV 复用
 * - decrypt 兼容旧数据：无 iv 字段时使用历史 AES_IV 解密
 */
import crypto from 'crypto';
import '../config/runtime-env.js';

const DEFAULT_LEGACY_IV = 'dev_aes_iv_16byte';
const NODE_ENV = process.env.NODE_ENV || 'development';

function normalizeBuffer(raw, length) {
  const buffer = Buffer.from(raw || '', 'utf8');
  if (buffer.length === length) return buffer;
  const padded = Buffer.alloc(length);
  buffer.copy(padded, 0, 0, Math.min(buffer.length, length));
  return padded;
}

/**
 * 校验密钥长度是否符合 AES-256 要求。
 * 自动生成的 AES_SECRET_KEY 会保持 32 字节；手动配置时也必须满足该长度。
 */
function getKey() {
  const raw = process.env.AES_SECRET_KEY || '';
  const key = Buffer.from(raw, 'utf8');
  if (key.length !== 32) {
    throw new Error('AES_SECRET_KEY 为空或长度不是 32 字节，自动生成失败');
  }
  return key;
}

/**
 * 仅用于解密旧数据。新加密数据会把随机 IV 写入 payload.iv。
 */
function getLegacyIv() {
  const raw = process.env.AES_IV || DEFAULT_LEGACY_IV;
  if (NODE_ENV === 'production' && !process.env.AES_IV) {
    throw new Error('旧版加密数据缺少 iv 字段，生产环境需配置 AES_IV 完成兼容解密');
  }
  const iv = Buffer.from(raw, 'utf8');
  return iv.length ? iv : normalizeBuffer(raw, 16);
}

function decodeIv(iv) {
  if (!iv) return getLegacyIv();
  return Buffer.from(iv, 'base64');
}

/**
 * AES-256-GCM 加密
 * @param {string} plaintext 待加密明文
 * @returns {{encrypted: string, authTag: string, iv: string}} base64 编码的密文、认证标签与随机 IV
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString('base64'),
    authTag: authTag.toString('base64'),
    iv: iv.toString('base64')
  };
}

/**
 * AES-256-GCM 解密
 * @param {string} encrypted base64 编码的密文
 * @param {string} authTag base64 编码的认证标签
 * @param {string|null} iv base64 编码的随机 IV；为空时按旧版固定 IV 解密
 * @returns {string} 解密后的原文
 */
export function decrypt(encrypted, authTag, iv = null) {
  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, decodeIv(iv));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

export default { encrypt, decrypt };
